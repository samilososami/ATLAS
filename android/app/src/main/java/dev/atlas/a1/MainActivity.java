package dev.atlas.a1;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.biometrics.*;
import android.net.Uri;
import android.os.*;
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
    private android.content.SharedPreferences prefs;

    @Override public void onCreate(Bundle state) {
        prefs=getSharedPreferences("atlas",MODE_PRIVATE);
        setTheme(isLight()?R.style.AtlasThemeLight:R.style.AtlasTheme);
        super.onCreate(state);
        locked=prefs.getBoolean("lock",false);
        connection=new AtlasConnection(this);updater=new AppUpdater(this);
        readWidgetIntent(getIntent());
        web=new WebView(this);
        frame=new FrameLayout(this);
        frame.addView(web,new FrameLayout.LayoutParams(-1,-1)); setContentView(frame);
        applyAppearance();
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
    private boolean isLight(){return "light".equals(prefs.getString("theme","dark"));}
    private void applyAppearance(){
        boolean light=isLight();int background=light?0xfff2f4f8:0xff080f20;
        setTheme(light?R.style.AtlasThemeLight:R.style.AtlasTheme);
        getWindow().setStatusBarColor(background);getWindow().setNavigationBarColor(background);
        int mask=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        getWindow().getInsetsController().setSystemBarsAppearance(light?mask:0,mask);
        frame.setBackgroundColor(background);web.setBackgroundColor(background);
    }
    private JSONObject object(Object... kv){JSONObject o=new JSONObject();try{for(int i=0;i<kv.length;i+=2)o.put((String)kv[i],kv[i+1]);}catch(Exception ignored){}return o;}
    private JSONObject config(){return object("paired",connection.pairing!=null,"name",connection.pairing==null?"ATLAS A1":connection.pairing.optString("name"),
        "relayConfigured",connection.pairing!=null&&!connection.pairing.optString("relay").isEmpty(),"lock",prefs.getBoolean("lock",false),
        "danger",prefs.getBoolean("danger",true),"pairAuth",prefs.getBoolean("pairAuth",true),"transport",prefs.getString("transport","auto"),"theme",isLight()?"light":"dark","version",appVersion());}
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
                    case "widgets.add": {
                        android.appwidget.AppWidgetManager manager=getSystemService(android.appwidget.AppWidgetManager.class);
                        if(!manager.isRequestPinAppWidgetSupported())throw new IOException("Mantén pulsada la pantalla de inicio y busca ATLAS en Widgets");
                        boolean requested=manager.requestPinAppWidget(new ComponentName(MainActivity.this,AtlasWidgetProvider.class),null,null);
                        answer(id,object("requested",requested),null);break;
                    }
                    case "pair": {
                        Runnable save=()->work(id,()->{
                            String code=p.getString("code").trim();if(!code.startsWith("atlas1:"))throw new IOException("Código ATLAS inválido");
                            JSONObject next=new JSONObject(new String(connection.decode(code.substring(7)),StandardCharsets.UTF_8));
                            if(next.optInt("v")!=1||connection.decode(next.getString("key")).length!=32||!next.getString("pin").matches("[0-9a-f]{64}")||!next.getString("url").startsWith("https://"))throw new IOException("Código incompleto");
                            JSONObject before=connection.pairing;connection.pairing=next;
                            try{rpc("ping",new JSONObject());}catch(Exception e){connection.pairing=before;throw e;}
                            prefs.edit().putString("pair",connection.encrypt(next.toString().getBytes(StandardCharsets.UTF_8),connection.vaultKey(),null)).apply();return config();
                        });
                        if(prefs.getBoolean("pairAuth",true))authenticate("Emparejar con tu ATLAS A1",save,()->answer(id,null,"Emparejamiento cancelado"));else save.run();break;
                    }
                    case "forget": connection.pairing=null;prefs.edit().remove("pair").apply();connection.close();WidgetStore.prefs(MainActivity.this).edit().remove("status").remove("time").remove("error").apply();AtlasWidgetProvider.updateAll(MainActivity.this);answer(id,config(),null);break;
                    case "settings": {
                        Runnable change=()->{for(String k:new String[]{"lock","danger","pairAuth"})if(p.has(k))prefs.edit().putBoolean(k,p.optBoolean(k)).apply();
                            if(p.has("transport")&&Arrays.asList("auto","lan","relay").contains(p.optString("transport")))prefs.edit().putString("transport",p.optString("transport")).apply();
                            if(p.has("theme")&&Arrays.asList("light","dark").contains(p.optString("theme"))){prefs.edit().putString("theme",p.optString("theme")).apply();applyAppearance();}
                            answer(id,config(),null);};
                        if(p.has("lock")||p.has("danger")||p.has("pairAuth"))authenticate("Cambiar protección de ATLAS",change,()->answer(id,null,"Sin cambios"));else change.run();break;
                    }
                    case "microphone":
                        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)answer(id,object("ok",true),null);
                        else {permissionId=id;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},7);}break;
                    case "wake": speech(p.optBoolean("enabled"));answer(id,object("ok",true),null);break;
                    case "haptic": web.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK);answer(id,object("ok",true),null);break;
                    case "execute": io.execute(()->{
                        try {JSONObject prepared=rpc("command.prepare",p);
                            ui.post(()->confirm(id,"Ejecutar en ATLAS A1",prepared.optString("command"),()->work(id,()->rpc("command.execute",object("nonce",prepared.getString("nonce"))))));
                        }catch(Exception e){answer(id,null,e.getMessage());}
                    });break;
                    case "terminal.open": confirm(id,"Abrir terminal","Acceso interactivo a A1 como su usuario. Los comandos con sudo pueden administrar todo el dispositivo.",()->work(id,()->rpc(method,p)));break;
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
        super.onRequestPermissionsResult(n,permissions,grants);boolean ok=grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED;
        if(micRequest!=null){if(ok)micRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else micRequest.deny();micRequest=null;}
        if(permissionId!=null){answer(permissionId,object("ok",ok),ok?null:"Micrófono denegado");permissionId=null;}
    }
    @Override protected void onResume(){super.onResume();background=false;
        if(locked&&!authPending){web.setVisibility(View.INVISIBLE);authenticate("Desbloquear ATLAS",()->{locked=false;web.setVisibility(View.VISIBLE);deliverWidget();},this::finish);}else deliverWidget();
    }
    @Override protected void onStop(){background=true;locked=prefs.getBoolean("lock",false);speech(false);event("suspend",object("reason","background"));
        io.execute(()->{try{rpc("session.close",new JSONObject());}catch(Exception ignored){}});super.onStop();}
    @Override protected void onDestroy(){speech(false);connection.close();web.destroy();io.shutdown();super.onDestroy();}
}
