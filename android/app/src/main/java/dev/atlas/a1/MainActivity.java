package dev.atlas.a1;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.biometrics.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.security.keystore.*;
import android.speech.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.crypto.*;
import javax.crypto.spec.*;
import javax.net.ssl.*;
import okhttp3.*;
import org.json.*;

public final class MainActivity extends Activity {
    private WebView web;
    private FrameLayout frame;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newFixedThreadPool(6);
    private final OkHttpClient normal = new OkHttpClient.Builder().callTimeout(40, TimeUnit.SECONDS).build();
    private AtlasConnection connection;
    private AppUpdater updater;
    private boolean updateBusy;
    private JSONObject widgetLaunch;
    private SpeechRecognizer recognizer;
    private boolean listening, background, pageReady, authPending, locked;
    private long speechGeneration=0;
    private PermissionRequest micRequest;
    private String permissionId;
    private String permissionKind;
    private BlePairingManager blePairing;
    private android.content.SharedPreferences prefs;
    private final AtlasConnection.RelayObserver relayObserver=(state,a1Online,detail)->event("linkState",linkConfig(state,a1Online,detail));

    @Override public void onCreate(Bundle state) {
        prefs=getSharedPreferences("atlas",MODE_PRIVATE);
        setTheme(R.style.AtlasTheme);
        super.onCreate(state);
        locked=prefs.getBoolean("lock",false);
        connection=AtlasRuntime.connection(this);connection.addRelayObserver(relayObserver);updater=new AppUpdater(this);
        blePairing=new BlePairingManager(this,new BlePairingManager.Events(){
            public void found(String name){event("pairDevice",object("name",name));}
            public void error(String message){event("pairError",object("message",message));}
            public void success(String payload){savePairingPayload(payload);}
        });
        readWidgetIntent(getIntent());
        web=new WebView(this);
        frame=new FrameLayout(this);
        frame.addView(web,new FrameLayout.LayoutParams(-1,-1)); setContentView(frame);
        applyAppearance();
        immersive();
        // WebView ignores padding for its document viewport. Inset the parent so
        // fixed HTML navigation also clears Android's bars and the keyboard.
        frame.setOnApplyWindowInsetsListener((v,insets)->{
            android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());
            v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return WindowInsets.CONSUMED;
        });
        frame.requestApplyInsets();
        WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new Bridge(),"AtlasNative");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r){ return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r){
                Uri u=r.getUrl(); if(!"atlas.local".equals(u.getHost()))return null;
                String path=u.getPath(); if(path==null||path.equals("/"))path="/index.html";
                if(path.contains(".."))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                try {
                    String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":path.endsWith(".svg")?"image/svg+xml":"text/html";
                    return new WebResourceResponse(mime,"UTF-8",getAssets().open("web"+path));
                } catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
            }
            @Override public void onPageFinished(WebView v,String url){pageReady=true;event("ready",config());deliverWidget();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest r){runOnUiThread(()->{
                if(!"https://atlas.local".equals(r.getOrigin().toString().replaceAll("/$",""))){r.deny();return;}
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)r.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else {micRequest=r;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},7);}
            });}
        });
        web.loadUrl("https://atlas.local/index.html");
    }
    private boolean isLight(){return false;}
    private void applyAppearance(){
        int background=0xff080f20;
        setTheme(R.style.AtlasTheme);
        getWindow().setStatusBarColor(background);getWindow().setNavigationBarColor(background);
        int mask=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        getWindow().getInsetsController().setSystemBarsAppearance(0,mask);
        frame.setBackgroundColor(background);web.setBackgroundColor(background);
    }
    private void immersive(){
        getWindow().setDecorFitsSystemWindows(false);
        WindowInsetsController controller=getWindow().getInsetsController();
        if(controller!=null){controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);controller.hide(WindowInsets.Type.systemBars());}
    }
    @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused)immersive();}
    private JSONObject object(Object... kv){JSONObject o=new JSONObject();try{for(int i=0;i<kv.length;i+=2)o.put((String)kv[i],kv[i+1]);}catch(Exception ignored){}return o;}
    private JSONObject config(){return linkConfig(connection.relayState(),connection.isA1Online(),connection.relayDetail());}
    private JSONObject linkConfig(AtlasConnection.RelayState state,boolean a1Online,String detail){return object("paired",connection.pairing!=null,"name",connection.pairing==null?"ATLAS A1":connection.pairing.optString("name"),
        "relayConfigured",connection.pairing!=null&&!connection.pairing.optString("relay").isEmpty(),"lock",prefs.getBoolean("lock",false),
        "danger",prefs.getBoolean("danger",true),"onboarding",prefs.getBoolean("onboarding",false),"theme","dark","version",appVersion(),
        "linkState",state==AtlasConnection.RelayState.ONLINE?(a1Online?"online":"relay"):state==AtlasConnection.RelayState.CONNECTING?"connecting":"reconnecting",
        "linkDetail",detail,"batteryUnrestricted",batteryUnrestricted());}
    private boolean batteryUnrestricted(){return getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName());}
    private void openBatteryAccess(){
        try{startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:"+getPackageName())));}
        catch(Exception unavailable){startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));}
    }
    private void maybeRequestPersistentLink(){
        if(connection.pairing==null||batteryUnrestricted()||prefs.getBoolean("batteryPrompted",false)||background)return;
        prefs.edit().putBoolean("batteryPrompted",true).apply();
        new AlertDialog.Builder(this).setTitle("Mantener ATLAS conectado")
            .setMessage("Permite que ATLAS funcione sin restricciones de batería para conservar la conexión con A1 cuando cierres la app o apagues la pantalla.")
            .setNegativeButton("Ahora no",null).setPositiveButton("Permitir",(d,w)->openBatteryAccess()).show();
    }
    private String appVersion(){try{return getPackageManager().getPackageInfo(getPackageName(),0).versionName;}catch(Exception e){return "ATLAS";}}
    private void readWidgetIntent(Intent intent){String type=intent.getStringExtra("widgetType");if(Arrays.asList("action","status","quota","chat","voice").contains(type))widgetLaunch=object("type",type,"actionId",intent.getStringExtra("actionId"));}
    private void deliverWidget(){if(pageReady&&!locked&&!background&&widgetLaunch!=null){JSONObject next=widgetLaunch;widgetLaunch=null;event("widget",next);}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);readWidgetIntent(intent);deliverWidget();}
    private void installUpdate(String id,JSONObject p)throws Exception{
        if(updateBusy){answer(id,null,"Ya se está descargando una actualización");return;}
        if(!getPackageManager().canRequestPackageInstalls()){
            answer(id,object("needsPermission",true),null);
            startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())));return;
        }
        long releaseId=p.getLong("id");updateBusy=true;
        io.execute(()->{try{
            updater.download(releaseId,percent->event("updateProgress",object("percent",percent)));
            ui.post(()->{updateBusy=false;if(background||locked){answer(id,null,"Descarga verificada. Vuelve a pulsar Instalar con ATLAS abierto.");return;}
                try{Intent install=new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("content://"+getPackageName()+".updates/update.apk"),"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(install);answer(id,object("installerOpened",true),null);
                }catch(Exception e){answer(id,null,"Android no pudo abrir el instalador: "+e.getMessage());}
            });
        }catch(Exception e){ui.post(()->{updateBusy=false;answer(id,null,e.getMessage());});}});
    }
    private String json(Object value){String array=new JSONArray().put(value).toString();return array.substring(1,array.length()-1);}
    private void event(String name,Object value){ui.post(()->{if(pageReady)web.evaluateJavascript("window.nativeEvent&&nativeEvent("+JSONObject.quote(name)+","+json(value)+")",null);});}
    private void answer(String id,Object result,String error){ui.post(()->web.evaluateJavascript("window.nativeReply&&nativeReply("+JSONObject.quote(id)+","+json(result)+","+(error==null?"null":JSONObject.quote(error))+")",null));}
    private JSONObject rpc(String method,JSONObject params)throws Exception{return connection.rpc(method,params);}
    private boolean granted(String kind){
        switch(kind){
            case "microphone":return checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;
            case "notifications":return Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
            case "bluetooth":return Build.VERSION.SDK_INT<31?checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED:
                checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;
            case "overlay":return Settings.canDrawOverlays(this);
            case "location":return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
            case "camera":return checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED;
            case "contacts":return checkSelfPermission(Manifest.permission.READ_CONTACTS)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.WRITE_CONTACTS)==PackageManager.PERMISSION_GRANTED;
            case "calendar":return checkSelfPermission(Manifest.permission.READ_CALENDAR)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.WRITE_CALENDAR)==PackageManager.PERMISSION_GRANTED;
            case "phone":return checkSelfPermission(Manifest.permission.READ_PHONE_STATE)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.CALL_PHONE)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.ANSWER_PHONE_CALLS)==PackageManager.PERMISSION_GRANTED;
            case "calllog":return checkSelfPermission(Manifest.permission.READ_CALL_LOG)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.WRITE_CALL_LOG)==PackageManager.PERMISSION_GRANTED;
            case "sms":return checkSelfPermission(Manifest.permission.READ_SMS)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.SEND_SMS)==PackageManager.PERMISSION_GRANTED;
            case "wifi":return Build.VERSION.SDK_INT<33||checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES)==PackageManager.PERMISSION_GRANTED;
            case "media":return Build.VERSION.SDK_INT<33?checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED:
                checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO)==PackageManager.PERMISSION_GRANTED;
            case "storage":return Build.VERSION.SDK_INT<30||Environment.isExternalStorageManager();
            case "activity":return checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BODY_SENSORS)==PackageManager.PERMISSION_GRANTED;
            default:return false;
        }
    }
    private String[] normalPermissions(String kind){
        switch(kind){
            case "microphone":return new String[]{Manifest.permission.RECORD_AUDIO};
            case "notifications":return Build.VERSION.SDK_INT>=33?new String[]{Manifest.permission.POST_NOTIFICATIONS}:new String[0];
            case "bluetooth":return Build.VERSION.SDK_INT>=31?new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT}:new String[]{Manifest.permission.ACCESS_FINE_LOCATION};
            case "location":return new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION};
            case "camera":return new String[]{Manifest.permission.CAMERA};
            case "contacts":return new String[]{Manifest.permission.READ_CONTACTS,Manifest.permission.WRITE_CONTACTS};
            case "calendar":return new String[]{Manifest.permission.READ_CALENDAR,Manifest.permission.WRITE_CALENDAR};
            case "phone":return new String[]{Manifest.permission.READ_PHONE_STATE,Manifest.permission.READ_PHONE_NUMBERS,Manifest.permission.CALL_PHONE,Manifest.permission.ANSWER_PHONE_CALLS};
            case "calllog":return new String[]{Manifest.permission.READ_CALL_LOG,Manifest.permission.WRITE_CALL_LOG};
            case "sms":return new String[]{Manifest.permission.READ_SMS,Manifest.permission.SEND_SMS,Manifest.permission.RECEIVE_SMS};
            case "wifi":return Build.VERSION.SDK_INT>=33?new String[]{Manifest.permission.NEARBY_WIFI_DEVICES}:new String[0];
            case "media":return Build.VERSION.SDK_INT>=33?new String[]{Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VIDEO,Manifest.permission.READ_MEDIA_AUDIO}:new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
            case "activity":return new String[]{Manifest.permission.ACTIVITY_RECOGNITION,Manifest.permission.BODY_SENSORS};
            default:return new String[0];
        }
    }
    private void requestPermissionKind(String id,String kind){
        if(granted(kind)){answer(id,object("granted",true),null);return;}
        if("overlay".equals(kind)){
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName())));
            answer(id,object("granted",false,"opened",true),null);return;
        }
        if("storage".equals(kind)&&Build.VERSION.SDK_INT>=30){
            startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,Uri.parse("package:"+getPackageName())));
            answer(id,object("granted",false,"opened",true),null);return;
        }
        String[] permissions=normalPermissions(kind);
        if(permissions.length==0){answer(id,object("granted",true),null);return;}
        permissionId=id;permissionKind=kind;requestPermissions(permissions,19);
    }
    private void savePairingPayload(String code){
        io.execute(()->{try{
            JSONObject next=new JSONObject(new String(connection.decode(code.substring(7)),StandardCharsets.UTF_8));
            if(next.optInt("v")!=1||connection.decode(next.getString("key")).length!=32||!next.getString("pin").matches("[0-9a-f]{64}")||!next.getString("relay").startsWith("wss://"))throw new IOException("Datos de emparejamiento incompletos");
            JSONObject before=connection.pairing;connection.close();connection.pairing=next;
            try{rpc("ping",new JSONObject());}catch(Exception e){connection.pairing=before;throw e;}
            prefs.edit().putString("pair",connection.encrypt(next.toString().getBytes(StandardCharsets.UTF_8),connection.vaultKey(),null)).apply();
            AtlasLinkService.start(this);event("pairSuccess",config());ui.postDelayed(this::maybeRequestPersistentLink,1400);
        }catch(Exception e){event("pairError",object("message",e.getMessage()==null?"No se pudo emparejar ATLAS A1":e.getMessage()));}});
    }
    private void authenticate(String reason,Runnable success,Runnable cancel){
        if(authPending){cancel.run();return;}
        int allowed=BiometricManager.Authenticators.BIOMETRIC_STRONG|BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        if(getSystemService(BiometricManager.class).canAuthenticate(allowed)!=BiometricManager.BIOMETRIC_SUCCESS){
            new AlertDialog.Builder(this).setTitle("Protege tu móvil").setMessage("Configura una huella, rostro seguro o bloqueo de pantalla en Android antes de usar esta protección.").setPositiveButton("Entendido",(d,w)->cancel.run()).setOnCancelListener(d->cancel.run()).show();return;
        }
        authPending=true;
        new BiometricPrompt.Builder(this).setTitle("ATLAS").setSubtitle(reason).setAllowedAuthenticators(allowed).build()
            .authenticate(new CancellationSignal(),getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r){authPending=false;success.run();}
                @Override public void onAuthenticationError(int code,CharSequence error){authPending=false;cancel.run();}
            });
    }
    private void confirm(String id,String title,String text,Runnable action){
        if(background||locked){answer(id,null,"Desbloquea ATLAS para autorizar esta acción");return;}
        new AlertDialog.Builder(this).setTitle(title).setMessage(text).setNegativeButton("Cancelar",(d,w)->answer(id,null,"Cancelado"))
            .setPositiveButton("Continuar",(d,w)->{if(prefs.getBoolean("danger",true))authenticate("Autorizar acción en A1",action,()->answer(id,null,"No autorizado"));else action.run();})
            .setOnCancelListener(d->answer(id,null,"Cancelado")).show();
    }
    private void work(String id,Callable<JSONObject> action){io.execute(()->{try{answer(id,action.call(),null);}catch(Exception e){String m=e.getMessage();answer(id,null,m==null?"No se pudo completar la operación":m.substring(0,Math.min(m.length(),240)));}});}
    private void speech(boolean enable){
        listening=enable;speechGeneration++;
        if(recognizer!=null){recognizer.cancel();recognizer.destroy();recognizer=null;}
        if(!enable||background)return;
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){event("speechError","Permite el micrófono primero");return;}
        if(!SpeechRecognizer.isRecognitionAvailable(this)){event("speechError","Instala o activa el reconocimiento de voz de Android; puedes usar Pulsar o Chat.");return;}
        recognizer=SpeechRecognizer.createSpeechRecognizer(this);
        final long gen=speechGeneration;
        recognizer.setRecognitionListener(new RecognitionListener(){
            public void onReadyForSpeech(Bundle b){} public void onBeginningOfSpeech(){} public void onRmsChanged(float r){} public void onBufferReceived(byte[] b){} public void onEndOfSpeech(){}
            private void deliver(Bundle b,boolean fin){ArrayList<String> text=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);if(text!=null&&!text.isEmpty())event("speech",object("text",text.get(0),"final",fin));}
            public void onResults(Bundle b){deliver(b,true);restart(350);}
            public void onPartialResults(Bundle b){deliver(b,false);}
            public void onEvent(int n,Bundle b){}
            public void onError(int e){if(e!=SpeechRecognizer.ERROR_NO_MATCH&&e!=SpeechRecognizer.ERROR_SPEECH_TIMEOUT)event("speechError","Reconocimiento Android: "+e);restart(e==SpeechRecognizer.ERROR_RECOGNIZER_BUSY?1500:700);}
            private void restart(int ms){ui.postDelayed(()->{if(listening&&!background&&gen==speechGeneration)speech(true);},ms);}
        });
        Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"es-ES");i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);recognizer.startListening(i);
    }
    public final class Bridge {
        @JavascriptInterface public void request(String id,String method,String params){
            ui.post(()->{try{
                JSONObject p=new JSONObject(params);
                if(locked&&!method.equals("config")&&!method.equals("session.close")&&!method.equals("terminal.close")){answer(id,null,"ATLAS está bloqueado");return;}
                if(background&&!method.equals("session.close")&&!method.equals("terminal.close")){answer(id,null,"App en segundo plano");return;}
                switch(method){
                    case "config": answer(id,config(),null);break;
                    case "updates.check": if(updateBusy)throw new IOException("Espera a que termine la descarga");work(id,()->updater.check());break;
                    case "updates.install": installUpdate(id,p);break;
                    case "widgets.sync": WidgetStore.sync(MainActivity.this,p.getJSONArray("actions"));answer(id,object("ok",true),null);break;
                    case "permissions.status": answer(id,object("granted",granted(p.getString("kind"))),null);break;
                    case "permissions.request": requestPermissionKind(id,p.getString("kind"));break;
                    case "battery.open": openBatteryAccess();answer(id,config(),null);break;
                    case "onboarding.finish": prefs.edit().putBoolean("onboarding",true).apply();answer(id,config(),null);break;
                    case "pair.scan": blePairing.scan();answer(id,object("scanning",true),null);break;
                    case "pair.submit": blePairing.submit(p.optString("code"));answer(id,object("connecting",true),null);break;
                    case "pair.stop": blePairing.stop();answer(id,object("ok",true),null);break;
                    case "forget": connection.pairing=null;prefs.edit().remove("pair").apply();connection.close();stopService(new Intent(MainActivity.this,AtlasLinkService.class));WidgetStore.prefs(MainActivity.this).edit().remove("status").remove("time").remove("error").apply();AtlasWidgetProvider.updateAll(MainActivity.this);answer(id,config(),null);break;
                    case "settings": {
                        Runnable change=()->{for(String k:new String[]{"lock","danger"})if(p.has(k))prefs.edit().putBoolean(k,p.optBoolean(k)).apply();
                            answer(id,config(),null);};
                        if(p.has("lock")||p.has("danger"))authenticate("Cambiar protección de ATLAS",change,()->answer(id,null,"Sin cambios"));else change.run();break;
                    }
                    case "microphone":
                        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)answer(id,object("ok",true),null);
                        else {permissionId=id;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},7);}break;
                    case "wake": speech(p.optBoolean("enabled"));answer(id,object("ok",true),null);break;
                    case "haptic": web.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK);answer(id,object("ok",true),null);break;
                    case "execute": io.execute(()->{
                        try {JSONObject prepared=rpc("command.prepare",p);
                            Runnable run=()->work(id,()->rpc("command.execute",object("nonce",prepared.getString("nonce"))));
                            ui.post(()->{if(prefs.getBoolean("danger",true))authenticate("Ejecutar en ATLAS A1",run,()->answer(id,null,"No autorizado"));else run.run();});
                        }catch(Exception e){answer(id,null,e.getMessage());}
                    });break;
                    case "terminal.open": {
                        Runnable run=()->work(id,()->rpc(method,p));
                        if(prefs.getBoolean("danger",true))authenticate("Abrir shell de ATLAS A1",run,()->answer(id,null,"No autorizado"));else run.run();break;
                    }
                    case "offer": work(id,()->{
                        String url=p.getString("url");Uri u=Uri.parse(url);
                        if(!"https".equals(u.getScheme())||!Arrays.asList("api.openai.com","chatgpt.com").contains(u.getHost()))throw new SecurityException("Servidor de voz no autorizado");
                        Request.Builder b=new Request.Builder().url(url).post(RequestBody.create(p.getString("sdp"),MediaType.get("application/sdp")));
                        JSONObject headers=p.optJSONObject("headers");if(headers!=null)for(Iterator<String> it=headers.keys();it.hasNext();){String key=it.next();b.header(key,headers.getString(key));}
                        try(Response r=normal.newBuilder().followRedirects(false).build().newCall(b.build()).execute()){
                            if(!r.isSuccessful())throw new IOException("OpenAI no pudo iniciar audio (HTTP "+r.code()+")");return object("sdp",r.body().string());}
                    });break;
                    default:
                        if(!Arrays.asList("ping","status","session.open","session.close","search","context.turn","event","terminal.read","terminal.write","terminal.resize","terminal.close").contains(method))throw new SecurityException("Operación no permitida");
                        work(id,()->rpc(method,p));
                }
            }catch(Exception e){answer(id,null,e.getMessage());}});
        }
    }
    @Override public void onRequestPermissionsResult(int n,String[] permissions,int[] grants){
        super.onRequestPermissionsResult(n,permissions,grants);
        if(n==7){boolean ok=checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;
            if(micRequest!=null){if(ok)micRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else micRequest.deny();micRequest=null;}
            if(permissionId!=null){answer(permissionId,object("granted",ok),ok?null:"Micrófono denegado");permissionId=null;permissionKind=null;}return;}
        if(n==19&&permissionId!=null){boolean ok=granted(permissionKind);answer(permissionId,object("granted",ok),null);permissionId=null;permissionKind=null;}
    }
    @Override protected void onResume(){super.onResume();background=false;immersive();if(connection.pairing!=null)AtlasLinkService.start(this);
        event("permissionsChanged",object("ok",true));event("linkState",config());
        if(locked&&!authPending){web.setVisibility(View.INVISIBLE);authenticate("Desbloquear ATLAS",()->{locked=false;web.setVisibility(View.VISIBLE);deliverWidget();ui.postDelayed(this::maybeRequestPersistentLink,700);},this::finish);}else {deliverWidget();ui.postDelayed(this::maybeRequestPersistentLink,700);}
    }
    @Override protected void onStop(){background=true;locked=prefs.getBoolean("lock",false);speech(false);event("suspend",object("reason","background"));
        io.execute(()->{try{rpc("session.close",new JSONObject());}catch(Exception ignored){}});super.onStop();}
    @Override protected void onDestroy(){pageReady=false;speech(false);blePairing.stop();connection.removeRelayObserver(relayObserver);web.destroy();io.shutdown();super.onDestroy();}
}
