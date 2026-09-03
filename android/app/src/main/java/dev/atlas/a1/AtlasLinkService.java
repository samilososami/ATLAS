package dev.atlas.a1;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Keeps the encrypted A1 relay socket warm for widgets and background state. */
public final class AtlasLinkService extends Service {
    static final String CHANNEL="atlas-link";
    private ScheduledExecutorService worker;

    static void start(Context context){
        if(!context.getSharedPreferences("atlas",0).contains("pair"))return;
        Intent intent=new Intent(context,AtlasLinkService.class);
        if(Build.VERSION.SDK_INT>=26)context.startForegroundService(intent);else context.startService(intent);
    }

    @Override public void onCreate(){
        super.onCreate();
        NotificationManager manager=getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Conexión con ATLAS A1",NotificationManager.IMPORTANCE_LOW));
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.widget_icon_device)
            .setContentTitle("ATLAS A1").setContentText("Conexión cifrada activa").setOngoing(true).setContentIntent(open).build();
        if(Build.VERSION.SDK_INT>=34)startForeground(41,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);else startForeground(41,notification);
        worker=Executors.newSingleThreadScheduledExecutor();
        worker.scheduleWithFixedDelay(()->{
            try{AtlasRuntime.connection(this).rpc("ping",new JSONObject());}
            catch(Exception ignored){}
        },0,25,TimeUnit.SECONDS);
    }
    @Override public int onStartCommand(Intent intent,int flags,int id){return START_STICKY;}
    @Override public android.os.IBinder onBind(Intent intent){return null;}
    @Override public void onDestroy(){if(worker!=null)worker.shutdownNow();super.onDestroy();}
}
