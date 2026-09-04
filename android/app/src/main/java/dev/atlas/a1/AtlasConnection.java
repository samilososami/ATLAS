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

/** Shared authenticated LAN/relay transport for the app and read-only widget jobs. */
final class AtlasConnection implements AutoCloseable {
    enum RelayState { DISCONNECTED, CONNECTING, ONLINE }
    interface RelayObserver { void changed(RelayState state,boolean a1Online,String detail); }

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
    private synchronized boolean current(WebSocket socket){return socket!=null&&socket==relay;}
    private synchronized CompletableFuture<Boolean> currentReady(WebSocket socket){return current(socket)?relayReady:null;}
    synchronized void openRelay()throws Exception{
        if(relay!=null&&relayReady!=null&&!relayReady.isCompletedExceptionally())return;
        String url=pairing.optString("relay");if(!url.startsWith("wss://"))throw new IOException("No hay relay configurado. Conecta a la misma Wi-Fi que A1.");
        relayReady=new CompletableFuture<>();
        setRelayState(RelayState.CONNECTING,false,"Conectando con el relay");
        relay=normal.newBuilder().pingInterval(60,TimeUnit.SECONDS).build().newWebSocket(new Request.Builder().url(url).build(),new WebSocketListener(){
            @Override public void onOpen(WebSocket w,Response r){if(!w.send(object("role","app","room",pairing.optString("room")).toString()))failRelay(w,"El relay no aceptó la autenticación");}
            @Override public void onMessage(WebSocket w,String text){try{
                if(!current(w))return;
                JSONObject v=new JSONObject(text);
                if(v.has("ok")){
                    if(!v.optBoolean("ok")){failRelay(w,"El relay rechazó la conexión");return;}
                    CompletableFuture<Boolean> ready=currentReady(w);if(ready!=null)ready.complete(true);
                    setRelayState(RelayState.ONLINE,v.optBoolean("online"),v.optBoolean("online")?"ATLAS A1 conectado":"Relay conectado; esperando a A1");return;
                }
                if(v.optBoolean("presence")){
                    boolean online=v.optBoolean("online");
                    setRelayState(RelayState.ONLINE,online,online?"ATLAS A1 conectado":"Relay conectado; esperando a A1");return;
                }
                if(v.has("box")){
                    JSONObject plain=unseal(v.getString("box"));CompletableFuture<JSONObject> f=pending.remove(plain.getString("id"));if(f!=null)f.complete(plain);
                    setRelayState(RelayState.ONLINE,true,"ATLAS A1 conectado");
                } else if(v.has("error")){
                    // A1 being offline is not a relay failure. Keep this socket alive so
                    // the next probe can recover immediately when the Pi reconnects.
                    a1Unavailable(v.optString("error","ATLAS A1 no está conectado"));
                }
            }catch(Exception e){failRelay(w,"No se pudo autenticar la respuesta de A1");}}
            @Override public void onFailure(WebSocket w,Throwable t,Response r){failRelay(w,"Conexión al relay interrumpida");}
            @Override public void onClosed(WebSocket w,int code,String reason){failRelay(w,"Relay desconectado");}
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
        if(ready==null||!ready.get(10,TimeUnit.SECONDS))throw new IOException("Relay rechazado");
    }
    JSONObject rpc(String method,JSONObject params)throws Exception{
        if(pairing==null)throw new IOException("Empareja primero tu ATLAS A1");
        String id=UUID.randomUUID().toString();String box=seal(object("id",id,"client",clientId,"device",deviceName,"method",method,"params",params));
        JSONObject reply;
        connectRelay();WebSocket socket;synchronized(this){socket=relay;}if(socket==null)throw new IOException("Relay sin conexión");
        CompletableFuture<JSONObject> future=new CompletableFuture<>();pending.put(id,future);
        try {if(!socket.send(object("box",box).toString())){failRelay(socket,"Relay sin conexión");throw new IOException("Relay sin conexión");}reply=future.get(40,TimeUnit.SECONDS);}
        finally{pending.remove(id);}
        if(!id.equals(reply.optString("id")))throw new SecurityException("Respuesta no correspondiente");
        if(reply.has("error"))throw new IOException(reply.getString("error"));return reply.getJSONObject("result");
    }

}
