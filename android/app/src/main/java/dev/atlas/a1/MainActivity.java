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
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newFixedThreadPool(6);
    private final OkHttpClient normal = new OkHttpClient.Builder().callTimeout(40, TimeUnit.SECONDS).build();
    private final Map<String, CompletableFuture<JSONObject>> pending = new ConcurrentHashMap<>();
    private final Set<String> received = ConcurrentHashMap.newKeySet();
    private final String clientId = UUID.randomUUID().toString();
    private JSONObject pairing;
    private WebSocket relay;
    private CompletableFuture<Boolean> relayReady;
    private SpeechRecognizer recognizer;
    private boolean listening, background, pageReady, authPending, locked;
    private long speechGeneration=0;
    private PermissionRequest micRequest;
    private String permissionId;
    private android.content.SharedPreferences prefs;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs=getSharedPreferences("atlas",MODE_PRIVATE);
        locked=prefs.getBoolean("lock",false);
        try { String saved=prefs.getString("pair",null); if(saved!=null)pairing=new JSONObject(vaultOpen(saved)); } catch(Exception e){pairing=null;}
        getWindow().setStatusBarColor(0xff080f20); getWindow().setNavigationBarColor(0xff080f20);
        web=new WebView(this); web.setBackgroundColor(0xff080f20);
        FrameLayout frame=new FrameLayout(this); frame.setBackgroundColor(0xff080f20);
        frame.addView(web,new FrameLayout.LayoutParams(-1,-1)); setContentView(frame);
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
                    String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":"text/html";
                    return new WebResourceResponse(mime,"UTF-8",getAssets().open("web"+path));
                } catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
            }
            @Override public void onPageFinished(WebView v,String url){pageReady=true;event("ready",config());}
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
    private JSONObject object(Object... kv){JSONObject o=new JSONObject();try{for(int i=0;i<kv.length;i+=2)o.put((String)kv[i],kv[i+1]);}catch(Exception ignored){}return o;}
    private JSONObject config(){return object("paired",pairing!=null,"name",pairing==null?"ATLAS A1":pairing.optString("name"),
        "relayConfigured",pairing!=null&&!pairing.optString("relay").isEmpty(),"lock",prefs.getBoolean("lock",false),
        "danger",prefs.getBoolean("danger",true),"pairAuth",prefs.getBoolean("pairAuth",true),"transport",prefs.getString("transport","auto"));}
    private String json(Object value){String array=new JSONArray().put(value).toString();return array.substring(1,array.length()-1);}
    private void event(String name,Object value){ui.post(()->{if(pageReady)web.evaluateJavascript("window.nativeEvent&&nativeEvent("+JSONObject.quote(name)+","+json(value)+")",null);});}
    private void answer(String id,Object result,String error){ui.post(()->web.evaluateJavascript("window.nativeReply&&nativeReply("+JSONObject.quote(id)+","+json(result)+","+(error==null?"null":JSONObject.quote(error))+")",null));}
    private String b64(byte[] b){return Base64.encodeToString(b,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);}
    private byte[] decode(String v){return Base64.decode(v,Base64.URL_SAFE|Base64.NO_WRAP);}
    private SecretKey vaultKey()throws Exception{
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(!ks.containsAlias("atlas-pair")){
            KeyGenerator g=KeyGenerator.getInstance("AES","AndroidKeyStore");
            g.init(new KeyGenParameterSpec.Builder("atlas-pair",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();
        }
        return (SecretKey)ks.getKey("atlas-pair",null);
    }
    private String encrypt(byte[] value,SecretKey key,String aad)throws Exception{
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key);
        if(aad!=null)c.updateAAD(aad.getBytes(StandardCharsets.UTF_8));byte[] out=c.doFinal(value);
        byte[] full=new byte[12+out.length];System.arraycopy(c.getIV(),0,full,0,12);System.arraycopy(out,0,full,12,out.length);return b64(full);
    }
    private byte[] decrypt(String box,SecretKey key,String aad)throws Exception{
        byte[] all=decode(box);if(all.length<29)throw new SecurityException("Mensaje inválido");
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,all,0,12));
        if(aad!=null)c.updateAAD(aad.getBytes(StandardCharsets.UTF_8));return c.doFinal(all,12,all.length-12);
    }
    private String vaultOpen(String value)throws Exception{return new String(decrypt(value,vaultKey(),null),StandardCharsets.UTF_8);}
    private String seal(JSONObject value)throws Exception{
        JSONObject payload=object("time",System.currentTimeMillis()/1000.0,"value",value);
        return encrypt(payload.toString().getBytes(StandardCharsets.UTF_8),new SecretKeySpec(decode(pairing.getString("key")),"AES"),"atlas-v1:app");
    }
    private JSONObject unseal(String box)throws Exception{
        String nonce=box.substring(0,16);if(received.contains(nonce))throw new SecurityException("Respuesta repetida");
        JSONObject payload=new JSONObject(new String(decrypt(box,new SecretKeySpec(decode(pairing.getString("key")),"AES"),"atlas-v1:pi"),StandardCharsets.UTF_8));
        if(Math.abs(System.currentTimeMillis()/1000.0-payload.getDouble("time"))>120)throw new SecurityException("Revisa la hora del móvil y la Pi");
        if(received.size()>10000)received.clear();received.add(nonce);return payload.getJSONObject("value");
    }
    private OkHttpClient pinned()throws Exception{
        final String pin=pairing.getString("pin");
        X509TrustManager trust=new X509TrustManager(){
            public X509Certificate[] getAcceptedIssuers(){return new X509Certificate[0];}
            public void checkClientTrusted(X509Certificate[] chain,String a)throws CertificateException{throw new CertificateException();}
            public void checkServerTrusted(X509Certificate[] chain,String a)throws CertificateException{
                try {byte[] hash=MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded());StringBuilder b=new StringBuilder();for(byte x:hash)b.append(String.format("%02x",x));
                    if(!MessageDigest.isEqual(pin.getBytes(StandardCharsets.US_ASCII),b.toString().getBytes(StandardCharsets.US_ASCII)))throw new CertificateException("La identidad de A1 ha cambiado");chain[0].checkValidity();
                }catch(CertificateException e){throw e;}catch(Exception e){throw new CertificateException(e);}
            }};
        SSLContext ssl=SSLContext.getInstance("TLS");ssl.init(null,new TrustManager[]{trust},new SecureRandom());
        // Hostnames change between LANs. The out-of-band certificate pin is the identity.
        return normal.newBuilder().sslSocketFactory(ssl.getSocketFactory(),trust).hostnameVerifier((h,s)->true)
            .followRedirects(false).retryOnConnectionFailure(false).connectTimeout(3,TimeUnit.SECONDS).build();
    }
    private synchronized void openRelay()throws Exception{
        if(relay!=null&&relayReady!=null)return;
        String url=pairing.optString("relay");if(!url.startsWith("wss://"))throw new IOException("No hay relay configurado. Conecta a la misma Wi-Fi que A1.");
        relayReady=new CompletableFuture<>();
        relay=normal.newBuilder().pingInterval(20,TimeUnit.SECONDS).build().newWebSocket(new Request.Builder().url(url).build(),new WebSocketListener(){
            @Override public void onOpen(WebSocket w,Response r){w.send(object("role","app","room",pairing.optString("room")).toString());}
            @Override public void onMessage(WebSocket w,String text){try{
                JSONObject v=new JSONObject(text);
                if(v.has("ok")){relayReady.complete(v.optBoolean("ok"));return;}
                if(v.has("box")){JSONObject plain=unseal(v.getString("box"));CompletableFuture<JSONObject> f=pending.remove(plain.getString("id"));if(f!=null)f.complete(plain);}
                else if(v.has("error"))failRelay("A1 no está conectado al relay");
            }catch(Exception e){failRelay("No se pudo autenticar la respuesta de A1");}}
            @Override public void onFailure(WebSocket w,Throwable t,Response r){failRelay("Conexión al relay interrumpida");}
            @Override public void onClosed(WebSocket w,int code,String reason){failRelay("Relay desconectado");}
        });
    }
    private synchronized void failRelay(String error){
        if(relayReady!=null)relayReady.completeExceptionally(new IOException(error));relay=null;
        for(CompletableFuture<JSONObject> f:pending.values())f.completeExceptionally(new IOException(error));pending.clear();
    }
    private JSONObject rpc(String method,JSONObject params)throws Exception{
        if(pairing==null)throw new IOException("Empareja primero tu ATLAS A1");
        String id=UUID.randomUUID().toString();String box=seal(object("id",id,"client",clientId,"method",method,"params",params));
        String mode=prefs.getString("transport","auto");JSONObject reply=null;
        if(!mode.equals("relay")){
            AtomicBoolean sent=new AtomicBoolean(false);
            Request req=new Request.Builder().url(pairing.getString("url")+"/rpc").post(RequestBody.create(object("box",box).toString(),MediaType.get("application/json"))).build();
            OkHttpClient lan=pinned().newBuilder().eventListener(new okhttp3.EventListener(){
                @Override public void requestHeadersStart(Call call){sent.set(true);}
            }).build();
            try(Response r=lan.newCall(req).execute()){
                if(!r.isSuccessful())throw new IOException("A1 rechazó el emparejamiento. Revisa fecha y código.");
                reply=unseal(new JSONObject(r.body().string()).getString("box"));
            }catch(IOException e){
                // A connect timeout is safe to route through the relay; an
                // uncertain write is not. Certificate failures never fall back.
                if(sent.get())throw new IOException("A1 no respondió. No se repite la acción automáticamente.",e);
                if(mode.equals("lan")||e instanceof SSLException||pairing.optString("relay").isEmpty())throw e;
            }
        }
        if(reply==null){
            openRelay(); if(!relayReady.get(10,TimeUnit.SECONDS))throw new IOException("Relay rechazado");
            CompletableFuture<JSONObject> future=new CompletableFuture<>();pending.put(id,future);
            try {if(!relay.send(object("box",box).toString()))throw new IOException("Relay sin conexión");reply=future.get(40,TimeUnit.SECONDS);}
            finally{pending.remove(id);}
        }
        if(!id.equals(reply.optString("id")))throw new SecurityException("Respuesta no correspondiente");
        if(reply.has("error"))throw new IOException(reply.getString("error"));return reply.getJSONObject("result");
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
                    case "pair": {
                        Runnable save=()->work(id,()->{
                            String code=p.getString("code").trim();if(!code.startsWith("atlas1:"))throw new IOException("Código ATLAS inválido");
                            JSONObject next=new JSONObject(new String(decode(code.substring(7)),StandardCharsets.UTF_8));
                            if(next.optInt("v")!=1||decode(next.getString("key")).length!=32||!next.getString("pin").matches("[0-9a-f]{64}")||!next.getString("url").startsWith("https://"))throw new IOException("Código incompleto");
                            JSONObject before=pairing;pairing=next;
                            try{rpc("ping",new JSONObject());}catch(Exception e){pairing=before;throw e;}
                            prefs.edit().putString("pair",encrypt(next.toString().getBytes(StandardCharsets.UTF_8),vaultKey(),null)).apply();return config();
                        });
                        if(prefs.getBoolean("pairAuth",true))authenticate("Emparejar con tu ATLAS A1",save,()->answer(id,null,"Emparejamiento cancelado"));else save.run();break;
                    }
                    case "forget": pairing=null;prefs.edit().remove("pair").apply();if(relay!=null)relay.close(1000,"Unpaired");relay=null;answer(id,config(),null);break;
                    case "settings": {
                        Runnable change=()->{for(String k:new String[]{"lock","danger","pairAuth"})if(p.has(k))prefs.edit().putBoolean(k,p.optBoolean(k)).apply();
                            if(p.has("transport")&&Arrays.asList("auto","lan","relay").contains(p.optString("transport")))prefs.edit().putString("transport",p.optString("transport")).apply();answer(id,config(),null);};
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
        if(locked&&!authPending){web.setVisibility(View.INVISIBLE);authenticate("Desbloquear ATLAS",()->{locked=false;web.setVisibility(View.VISIBLE);},this::finish);}
    }
    @Override protected void onStop(){background=true;locked=prefs.getBoolean("lock",false);speech(false);event("suspend",object("reason","background"));
        io.execute(()->{try{rpc("session.close",new JSONObject());}catch(Exception ignored){}});super.onStop();}
    @Override protected void onDestroy(){speech(false);if(relay!=null)relay.close(1000,"Closed");web.destroy();io.shutdown();super.onDestroy();}
}
