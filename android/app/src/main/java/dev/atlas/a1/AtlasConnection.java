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
import java.net.*;
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

/** Shared authenticated direct/Tailscale transport for the app and read-only widget jobs. */
final class AtlasConnection implements AutoCloseable {
    enum RelayState { DISCONNECTED, CONNECTING, ONLINE }
    interface RelayObserver { void changed(RelayState state,boolean a1Online,String detail); }
    interface InboundHandler { JSONObject handle(String method,JSONObject params)throws Exception; }

    final SharedPreferences prefs;
    final OkHttpClient normal=new OkHttpClient.Builder().callTimeout(40,TimeUnit.SECONDS).build();
    final Map<String,CompletableFuture<JSONObject>> pending=new ConcurrentHashMap<>();
    final Set<String> received=ConcurrentHashMap.newKeySet();
    final String clientId;
    final String deviceName;
    volatile JSONObject pairing;
    private final Set<RelayObserver> relayObservers=new CopyOnWriteArraySet<>();
    private volatile RelayState relayState=RelayState.DISCONNECTED;
    private volatile boolean a1Online;
    private volatile String relayDetail="Sin conectar";
    private WebSocket relay;
    private CompletableFuture<Boolean> relayReady;
    private volatile InboundHandler inboundHandler;
    private final ExecutorService inboundWorker=Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"atlas-phone-rpc");t.setDaemon(true);return t;});
    private final ScheduledExecutorService heartbeatWorker=Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"atlas-a1-heartbeat");t.setDaemon(true);return t;});
    private ScheduledFuture<?> heartbeat;
    AtlasConnection(Context context) {
        prefs=context.getSharedPreferences("atlas",Context.MODE_PRIVATE);
        String savedClient=prefs.getString("clientId",null);
        clientId=savedClient==null?UUID.randomUUID().toString():savedClient;
        if(savedClient==null)prefs.edit().putString("clientId",clientId).apply();
        deviceName=friendlyDeviceName(context);
        try{String saved=prefs.getString("pair",null);if(saved!=null)pairing=new JSONObject(vaultOpen(saved));}catch(Exception ignored){}
    }
    static String friendlyDeviceName(Context context){
        String model=Build.MODEL==null?"Android":Build.MODEL.trim();
        String upper=model.toUpperCase(Locale.ROOT);
        if(upper.startsWith("SM-S918"))return "s23u";
        if(upper.startsWith("SM-S916"))return "s23+";
        if(upper.startsWith("SM-S911"))return "s23";
        try{String configured=Settings.Global.getString(context.getContentResolver(),Settings.Global.DEVICE_NAME);if(configured!=null&&!configured.isBlank())return configured.substring(0,Math.min(40,configured.length()));}catch(Exception ignored){}
        return model.substring(0,Math.min(40,model.length()));
    }
    JSONObject object(Object...kv){JSONObject o=new JSONObject();try{for(int i=0;i<kv.length;i+=2)o.put((String)kv[i],kv[i+1]);}catch(Exception ignored){}return o;}
    void addRelayObserver(RelayObserver observer){
        relayObservers.add(observer);observer.changed(relayState,a1Online,relayDetail);
    }
    void removeRelayObserver(RelayObserver observer){relayObservers.remove(observer);}
    void setInboundHandler(InboundHandler handler){inboundHandler=handler;}
    RelayState relayState(){return relayState;}
    boolean isRelayConnected(){return relayState==RelayState.ONLINE&&relay!=null;}
    boolean isA1Online(){return a1Online;}
    String relayDetail(){return relayDetail;}
    private void setRelayState(RelayState state,boolean online,String detail){
        if(relayState==state&&a1Online==online&&Objects.equals(relayDetail,detail))return;
        relayState=state;a1Online=online;relayDetail=detail;
        for(RelayObserver observer:relayObservers)try{observer.changed(state,online,detail);}catch(Exception ignored){}
    }
    public void close(){resetRelay("Conexión cerrada");}
    void resetRelay(String reason){
        WebSocket socket;
        synchronized(this){socket=relay;}
        failRelay(socket,reason);
        if(socket!=null)socket.cancel();
    }
    String b64(byte[] b){return Base64.encodeToString(b,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);}
    byte[] decode(String v){return Base64.decode(v,Base64.URL_SAFE|Base64.NO_WRAP);}
    SecretKey vaultKey()throws Exception{
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(!ks.containsAlias("atlas-pair")){
            KeyGenerator g=KeyGenerator.getInstance("AES","AndroidKeyStore");
            g.init(new KeyGenParameterSpec.Builder("atlas-pair",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();
        }
        return (SecretKey)ks.getKey("atlas-pair",null);
    }
    String encrypt(byte[] value,SecretKey key,String aad)throws Exception{
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key);
        if(aad!=null)c.updateAAD(aad.getBytes(StandardCharsets.UTF_8));byte[] out=c.doFinal(value);
        byte[] full=new byte[12+out.length];System.arraycopy(c.getIV(),0,full,0,12);System.arraycopy(out,0,full,12,out.length);return b64(full);
    }
    byte[] decrypt(String box,SecretKey key,String aad)throws Exception{
        byte[] all=decode(box);if(all.length<29)throw new SecurityException("Mensaje inválido");
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,all,0,12));
        if(aad!=null)c.updateAAD(aad.getBytes(StandardCharsets.UTF_8));return c.doFinal(all,12,all.length-12);
    }
    String vaultOpen(String value)throws Exception{return new String(decrypt(value,vaultKey(),null),StandardCharsets.UTF_8);}
    String seal(JSONObject value)throws Exception{
        JSONObject payload=object("time",System.currentTimeMillis()/1000.0,"value",value);
        return encrypt(payload.toString().getBytes(StandardCharsets.UTF_8),new SecretKeySpec(decode(pairing.getString("key")),"AES"),"atlas-v1:app");
    }
    JSONObject unseal(String box)throws Exception{
        String nonce=box.substring(0,16);if(received.contains(nonce))throw new SecurityException("Respuesta repetida");
        JSONObject payload=new JSONObject(new String(decrypt(box,new SecretKeySpec(decode(pairing.getString("key")),"AES"),"atlas-v1:pi"),StandardCharsets.UTF_8));
        if(Math.abs(System.currentTimeMillis()/1000.0-payload.getDouble("time"))>120)throw new SecurityException("Revisa la hora del móvil y la Pi");
        if(received.size()>10000)received.clear();received.add(nonce);return payload.getJSONObject("value");
    }
    OkHttpClient pinned()throws Exception{
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
    private String configuredDirectEndpoint(){
        if(pairing==null)return "";
        String endpoint=pairing.optString("endpoint","").trim();if(!endpoint.isEmpty())return endpoint;
        String host=pairing.optString("tailscale","").trim();if(host.isEmpty())host=pairing.optString("tailscaleIp","").trim();
        if(!host.isEmpty())return host.contains("://")?host:"wss://"+host+":5010/app";
        String direct=pairing.optString("direct","").trim();if(!direct.isEmpty())return direct.replaceFirst("^https://","wss://").replaceFirst("/rpc/?$","/app");
        return "";
    }
    private String legacyEndpoint(){
        if(pairing==null)return "";String legacy=pairing.optString("url","").trim();if(legacy.isEmpty())legacy=pairing.optString("relay","").trim();return legacy;
    }
    private String directEndpoint(){
        String configured=configuredDirectEndpoint();
        // Existing v1 pairings already contain the same app-layer key and TLS
        // certificate pin. Probe MagicDNS without mutating that saved payload.
        if(configured.isEmpty()&&!legacyEndpoint().isEmpty())return "wss://atlas-a1:5010/app";
        return configured;
    }
    synchronized void preferDirect(){}
    private boolean explicitlyUsesLegacyRelay(){
        return pairing!=null&&"legacy-relay".equals(pairing.optString("transport"))&&!legacyEndpoint().isEmpty();
    }
    private String endpoint()throws IOException{
        String direct=directEndpoint();
        String legacy=legacyEndpoint();String value=explicitlyUsesLegacyRelay()?legacy:(!direct.isEmpty()?direct:legacy);
        if(value.startsWith("https://"))value="wss://"+value.substring(8);
        if(!value.startsWith("wss://"))throw new IOException("A1 no tiene una dirección Tailscale segura configurada");
        return value;
    }
    boolean hasEndpoint(){try{return pairing!=null&&!endpoint().isEmpty();}catch(Exception ignored){return false;}}
    boolean usesDirectEndpoint(){return !directEndpoint().isEmpty()&&!explicitlyUsesLegacyRelay();}
    private void failTransport(WebSocket socket,String error,boolean direct){
        // Tailscale is the selected transport. A transient direct failure must
        // never demote the app to a stale Cloudflare URL saved by an older
        // pairing; doing so made recovery impossible when that relay was gone.
        synchronized(this){
            if(socket!=null&&socket!=relay)return;
        }
        failRelay(socket,error);
    }
    private String transportFailureMessage(Throwable error,boolean direct){
        Throwable cause=error;while(cause.getCause()!=null&&cause.getCause()!=cause)cause=cause.getCause();
        if(cause instanceof SSLException)return "No se pudo verificar la identidad segura de ATLAS A1";
        if(direct&&(cause instanceof ConnectException||cause instanceof SocketTimeoutException||cause instanceof NoRouteToHostException||cause instanceof UnknownHostException))
            return "No se puede alcanzar ATLAS A1. Activa Tailscale en este teléfono e inténtalo de nuevo";
        return direct?"Conexión directa con ATLAS A1 interrumpida":"Conexión al relay interrumpida";
    }
    private synchronized boolean current(WebSocket socket){return socket!=null&&socket==relay;}
    private synchronized CompletableFuture<Boolean> currentReady(WebSocket socket){return current(socket)?relayReady:null;}
    private JSONObject directPing(String id){return object("id",id,"client",clientId,"device",deviceName,"method","ping","params",new JSONObject());}
    private synchronized void stopHeartbeat(WebSocket source){
        if(source!=null&&source!=relay)return;
        if(heartbeat!=null)heartbeat.cancel(false);heartbeat=null;
    }
    private void startHeartbeat(WebSocket socket){
        synchronized(this){
            stopHeartbeat(socket);
            heartbeat=heartbeatWorker.scheduleWithFixedDelay(()->{
                try{
                    if(!current(socket)){stopHeartbeat(socket);return;}
                    String box=seal(directPing("heartbeat-"+UUID.randomUUID()));
                    if(!socket.send(object("box",box).toString()))failTransport(socket,"ATLAS A1 sin conexión",true);
                }catch(Exception error){failTransport(socket,"No se pudo mantener la conexión con ATLAS A1",true);}
            },20,20,TimeUnit.SECONDS);
        }
    }
    synchronized void openRelay()throws Exception{
        if(relay!=null&&relayReady!=null&&!relayReady.isCompletedExceptionally())return;
        String url=endpoint();boolean direct=usesDirectEndpoint();
        relayReady=new CompletableFuture<>();
        setRelayState(RelayState.CONNECTING,false,direct?"Conectando directamente con ATLAS A1":"Conectando con el relay");
        OkHttpClient transport=(direct?pinned():normal).newBuilder().pingInterval(20,TimeUnit.SECONDS).readTimeout(0,TimeUnit.MILLISECONDS).build();
        final String directProbeId=direct?"connect-"+UUID.randomUUID():"";
        relay=transport.newWebSocket(new Request.Builder().url(url).build(),new WebSocketListener(){
            @Override public void onOpen(WebSocket w,Response r){
                try{
                    // The private /app endpoint accepts encrypted envelopes from the
                    // very first frame. Only the deprecated public relay has a
                    // plaintext role/room handshake.
                    JSONObject first=direct?object("box",seal(directPing(directProbeId))):object("role","app","room",pairing.optString("room"),"client",clientId,"device",deviceName,"transport","relay");
                    if(!w.send(first.toString()))failTransport(w,"ATLAS A1 no aceptó la autenticación",direct);
                }catch(Exception error){failTransport(w,"No se pudo autenticar con ATLAS A1",direct);}
            }
            @Override public void onMessage(WebSocket w,String text){try{
                if(!current(w))return;
                JSONObject v=new JSONObject(text);
                if(v.has("ok")){
                    if(!v.optBoolean("ok")){failRelay(w,"El relay rechazó la conexión");return;}
                    CompletableFuture<Boolean> ready=currentReady(w);if(ready!=null)ready.complete(true);
                    boolean online=direct||v.optBoolean("online");
                    setRelayState(RelayState.ONLINE,online,online?"ATLAS A1 conectado":"Relay conectado; esperando a A1");return;
                }
                if(v.optBoolean("presence")){
                    boolean online=v.optBoolean("online");
                    setRelayState(RelayState.ONLINE,online,online?"ATLAS A1 conectado":"Relay conectado; esperando a A1");return;
                }
                if(v.has("box")){
                    JSONObject plain=unseal(v.getString("box"));String id=plain.optString("id");CompletableFuture<JSONObject> f=pending.remove(id);
                    if(direct&&directProbeId.equals(id)){
                        if(plain.has("error")){failTransport(w,plain.optString("error","ATLAS A1 rechazó la conexión"),true);return;}
                        CompletableFuture<Boolean> ready=currentReady(w);if(ready!=null)ready.complete(true);
                        setRelayState(RelayState.ONLINE,true,"ATLAS A1 conectado");startHeartbeat(w);return;
                    }
                    if(f!=null)f.complete(plain);else if(plain.has("method"))dispatchInbound(w,plain);
                    setRelayState(RelayState.ONLINE,true,"ATLAS A1 conectado");
                } else if(v.has("error")){
                    if(direct){failTransport(w,"ATLAS A1 rechazó la conexión cifrada",true);w.cancel();return;}
                    // A1 being offline is not a relay failure. Keep this socket alive so
                    // the next probe can recover immediately when the Pi reconnects.
                    a1Unavailable(v.optString("error","ATLAS A1 no está conectado"));
                }
            }catch(Exception e){failTransport(w,"No se pudo autenticar la respuesta de A1",direct);}}
            @Override public void onFailure(WebSocket w,Throwable t,Response r){failTransport(w,transportFailureMessage(t,direct),direct);}
            @Override public void onClosed(WebSocket w,int code,String reason){failTransport(w,direct?"ATLAS A1 desconectado":"Relay desconectado",direct);}
        });
    }
    private void dispatchInbound(WebSocket socket,JSONObject request){
        final InboundHandler handler=inboundHandler;
        if(handler==null)return;
        inboundWorker.execute(()->{
            JSONObject params=object("requestId",request.optString("id"));
            try{params.put("result",handler.handle(request.getString("method"),request.optJSONObject("params")==null?new JSONObject():request.getJSONObject("params")));}
            catch(Exception error){try{params.put("error",error.getMessage()==null?"No se pudo ejecutar la acción en Android":error.getMessage());}catch(Exception ignored){}}
            // Server-initiated requests are acknowledged through the same normal
            // authenticated RPC shape. A bare {id,result} would be interpreted as
            // a new client request by the direct companion endpoint.
            JSONObject reply=object("id","reply-"+UUID.randomUUID(),"client",clientId,"device",deviceName,"method","app.reply","params",params);
            try{String box=seal(reply);synchronized(AtlasConnection.this){if(current(socket))socket.send(object("box",box).toString());}}
            catch(Exception ignored){}
        });
    }
    private void a1Unavailable(String error){
        IOException cause=new IOException(error);
        for(CompletableFuture<JSONObject> f:pending.values())f.completeExceptionally(cause);pending.clear();
        setRelayState(RelayState.ONLINE,false,"Relay conectado; esperando a A1");
    }
    private void failRelay(WebSocket source,String error){
        CompletableFuture<Boolean> ready;
        synchronized(this){
            if(source!=null&&source!=relay)return;
            if(source==null&&relay!=null)return;
            stopHeartbeat(source);
            ready=relayReady;relay=null;relayReady=null;
        }
        IOException cause=new IOException(error);
        if(ready!=null&&!ready.isDone())ready.completeExceptionally(cause);
        for(CompletableFuture<JSONObject> f:pending.values())f.completeExceptionally(cause);pending.clear();
        setRelayState(RelayState.DISCONNECTED,false,error);
    }
    void connectRelay()throws Exception{
        if(pairing==null)throw new IOException("Empareja primero tu ATLAS A1");
        CompletableFuture<Boolean> ready;
        openRelay();synchronized(this){ready=relayReady;}
        try{if(ready==null||!ready.get(10,TimeUnit.SECONDS))throw new IOException("ATLAS A1 rechazó la conexión");}
        catch(ExecutionException error){
            Throwable cause=error.getCause();if(cause instanceof Exception)throw (Exception)cause;throw error;
        }
    }
    JSONObject rpc(String method,JSONObject params)throws Exception{
        if(pairing==null)throw new IOException("Empareja primero tu ATLAS A1");
        String id=UUID.randomUUID().toString();String box=seal(object("id",id,"client",clientId,"device",deviceName,"method",method,"params",params));
        JSONObject reply;
        connectRelay();WebSocket socket;synchronized(this){socket=relay;}if(socket==null)throw new IOException("ATLAS A1 sin conexión");
        CompletableFuture<JSONObject> future=new CompletableFuture<>();pending.put(id,future);
        try {if(!socket.send(object("box",box).toString())){failRelay(socket,"ATLAS A1 sin conexión");throw new IOException("ATLAS A1 sin conexión");}reply=future.get(40,TimeUnit.SECONDS);}
        finally{pending.remove(id);}
        if(!id.equals(reply.optString("id")))throw new SecurityException("Respuesta no correspondiente");
        if(reply.has("error"))throw new IOException(reply.getString("error"));return reply.getJSONObject("result");
    }

    /** Legacy relay mode is explicit; normal Tailscale sessions never need migration probes. */
    synchronized boolean shouldProbeDirect(){
        return false;
    }

    /**
     * Tests the pinned MagicDNS/Tailscale endpoint without touching the live
     * relay socket. The caller may swap transports only after the encrypted
     * ping round-trip succeeds.
     */
    boolean probeDirectAvailability(){
        if(pairing==null||!shouldProbeDirect())return false;
        final CompletableFuture<Boolean> outcome=new CompletableFuture<>();
        final String probeId="migration-"+UUID.randomUUID();
        final AtomicBoolean finished=new AtomicBoolean();
        try{
            OkHttpClient transport=pinned().newBuilder().pingInterval(20,TimeUnit.SECONDS)
                .readTimeout(0,TimeUnit.MILLISECONDS).connectTimeout(3,TimeUnit.SECONDS).build();
            WebSocket probe=transport.newWebSocket(new Request.Builder().url(directEndpoint()).build(),new WebSocketListener(){
                private void finish(WebSocket socket,boolean ok){if(!finished.compareAndSet(false,true))return;outcome.complete(ok);try{socket.close(1000,"probe complete");}catch(Exception ignored){}}
                @Override public void onOpen(WebSocket socket,Response response){
                    try{socket.send(object("box",seal(directPing(probeId))).toString());}
                    catch(Exception error){finish(socket,false);}
                }
                @Override public void onMessage(WebSocket socket,String text){
                    try{
                        JSONObject envelope=new JSONObject(text);if(!envelope.has("box")){finish(socket,false);return;}
                        JSONObject plain=unseal(envelope.getString("box"));
                        if(probeId.equals(plain.optString("id")))finish(socket,!plain.has("error"));
                    }catch(Exception error){finish(socket,false);}
                }
                @Override public void onFailure(WebSocket socket,Throwable error,Response response){finish(socket,false);}
                @Override public void onClosed(WebSocket socket,int code,String reason){finish(socket,false);}
            });
            heartbeatWorker.schedule(()->{if(finished.compareAndSet(false,true)){outcome.complete(false);probe.cancel();}},6,TimeUnit.SECONDS);
            return outcome.get(7,TimeUnit.SECONDS);
        }catch(Exception error){return false;}
    }

}
