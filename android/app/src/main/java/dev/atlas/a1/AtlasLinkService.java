package dev.atlas.a1;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.*;
import android.os.*;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Owns the persistent encrypted A1 link independently from the visible activity. */
public final class AtlasLinkService extends Service {
    static final String CHANNEL="atlas-link";
    private static final int NOTIFICATION_ID=41;
    private static final long PROBE_MS=25_000;
    private static final long MAX_RETRY_MS=30_000;

    private final Object scheduleLock=new Object();
    private final AtlasConnection.RelayObserver relayObserver=this::relayChanged;
    private ScheduledExecutorService worker;
    private ScheduledFuture<?> nextAttempt;
    private long nextAttemptAt=Long.MAX_VALUE;
    private volatile long retryMs=1_000;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile Network activeNetwork;
    private volatile boolean destroyed;
    private AtlasConnection connection;
    private NotificationManager notifications;

    static void start(Context context){
        if(!context.getSharedPreferences("atlas",0).contains("pair"))return;
        Intent intent=new Intent(context,AtlasLinkService.class);
        if(Build.VERSION.SDK_INT>=26)context.startForegroundService(intent);else context.startService(intent);
    }

    @Override public void onCreate(){
        super.onCreate();
        worker=Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"atlas-link-supervisor");t.setDaemon(true);return t;});
        notifications=getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL,"Conexión con ATLAS A1",NotificationManager.IMPORTANCE_LOW));
        if(Build.VERSION.SDK_INT>=34)startForeground(NOTIFICATION_ID,notification("Preparando conexión…"),ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        else startForeground(NOTIFICATION_ID,notification("Preparando conexión…"));

        connectivity=getSystemService(ConnectivityManager.class);
        activeNetwork=connectivity.getActiveNetwork();
        connection=AtlasRuntime.connection(this);
        connection.addRelayObserver(relayObserver);
        networkCallback=new ConnectivityManager.NetworkCallback(){
            @Override public void onAvailable(Network network){
                Network previous=activeNetwork;activeNetwork=network;
                if(previous!=null&&!previous.equals(network))connection.resetRelay("La red del móvil ha cambiado");
                retryMs=1_000;scheduleAttempt(0);
            }
            @Override public void onLost(Network network){
                if(network.equals(activeNetwork)){
                    activeNetwork=null;connection.resetRelay("Sin conexión a Internet");
                    updateState("waiting",false,"Esperando conexión a Internet");scheduleAttempt(5_000);
                }
            }
        };
        try{connectivity.registerDefaultNetworkCallback(networkCallback);}catch(Exception ignored){}
        scheduleAttempt(0);
    }

    private Notification notification(String text){
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.widget_icon_device)
            .setContentTitle("ATLAS A1").setContentText(text).setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE).setContentIntent(open).build();
    }

    private boolean hasInternet(){
        if(connectivity==null)return false;
        Network network=activeNetwork;if(network==null)return false;
        NetworkCapabilities capabilities=connectivity.getNetworkCapabilities(network);
        return capabilities!=null&&capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void relayChanged(AtlasConnection.RelayState state,boolean a1Online,String detail){
        if(destroyed)return;
        if(state==AtlasConnection.RelayState.ONLINE){
            retryMs=1_000;updateState(a1Online?"online":"relay",a1Online,a1Online?"ATLAS A1 conectado":"Relay conectado · esperando a A1");
            scheduleAttempt(PROBE_MS);
        }else if(state==AtlasConnection.RelayState.CONNECTING){
            updateState("connecting",false,"Conectando con ATLAS A1…");
        }else{
            updateState("reconnecting",false,hasInternet()?"Reconectando con ATLAS A1…":"Esperando conexión a Internet");
            scheduleFailure();
        }
    }

    private void updateState(String state,boolean a1Online,String text){
        getSharedPreferences("atlas-link",MODE_PRIVATE).edit().putString("state",state).putBoolean("a1Online",a1Online)
            .putString("detail",text).putLong("updatedAt",System.currentTimeMillis()).apply();
        if(notifications!=null)notifications.notify(NOTIFICATION_ID,notification(text));
    }

    private void scheduleFailure(){
        long delay=retryMs;retryMs=Math.min(MAX_RETRY_MS,retryMs*2);scheduleAttempt(delay);
    }

    private void scheduleAttempt(long delayMs){
        if(destroyed||worker==null)return;
        long target=SystemClock.elapsedRealtime()+Math.max(0,delayMs);
        synchronized(scheduleLock){
            if(nextAttempt!=null&&!nextAttempt.isDone()&&nextAttemptAt<=target)return;
            if(nextAttempt!=null)nextAttempt.cancel(false);
            nextAttemptAt=target;
            nextAttempt=worker.schedule(this::attempt,Math.max(0,delayMs),TimeUnit.MILLISECONDS);
        }
    }

    private void attempt(){
        synchronized(scheduleLock){nextAttempt=null;nextAttemptAt=Long.MAX_VALUE;}
        if(destroyed)return;
        if(connection.pairing==null){stopSelf();return;}
        if(!hasInternet()){
            updateState("waiting",false,"Esperando conexión a Internet");scheduleAttempt(5_000);return;
        }
        try{
            connection.connectRelay();
            try{
                connection.rpc("ping",new JSONObject());
                updateState("online",true,"ATLAS A1 conectado");
            }catch(Exception unavailable){
                if(connection.isRelayConnected())updateState("relay",false,"Relay conectado · esperando a A1");
                else throw unavailable;
            }
            retryMs=1_000;scheduleAttempt(PROBE_MS);
        }catch(Exception failure){
            if(!connection.isRelayConnected()){
                if(connection.relayState()!=AtlasConnection.RelayState.DISCONNECTED)connection.resetRelay("No se pudo completar la conexión");
                updateState("reconnecting",false,"Reconectando con ATLAS A1…");scheduleAttempt(retryMs);
            }else scheduleAttempt(PROBE_MS);
        }
    }

    @Override public int onStartCommand(Intent intent,int flags,int id){scheduleAttempt(0);return START_STICKY;}
    @Override public android.os.IBinder onBind(Intent intent){return null;}
    @Override public void onDestroy(){
        destroyed=true;
        if(connection!=null)connection.removeRelayObserver(relayObserver);
        if(connectivity!=null&&networkCallback!=null)try{connectivity.unregisterNetworkCallback(networkCallback);}catch(Exception ignored){}
        synchronized(scheduleLock){if(nextAttempt!=null)nextAttempt.cancel(true);}
        if(worker!=null)worker.shutdownNow();
        if(connection!=null)connection.resetRelay("Servicio detenido");
        super.onDestroy();
    }
}
