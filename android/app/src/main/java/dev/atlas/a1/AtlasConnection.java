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
    final SharedPreferences prefs;
    final OkHttpClient normal=new OkHttpClient.Builder().callTimeout(40,TimeUnit.SECONDS).build();
    final Map<String,CompletableFuture<JSONObject>> pending=new ConcurrentHashMap<>();
    final Set<String> received=ConcurrentHashMap.newKeySet();
    final String clientId;
    final String deviceName;
    volatile JSONObject pairing;
    WebSocket relay;
    CompletableFuture<Boolean> relayReady;
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
    public synchronized void close(){if(relay!=null)relay.close(1000,"Closed");failRelay("Conexión cerrada");}
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
    synchronized void openRelay()throws Exception{
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
    synchronized void failRelay(String error){
        if(relayReady!=null)relayReady.completeExceptionally(new IOException(error));relay=null;
        for(CompletableFuture<JSONObject> f:pending.values())f.completeExceptionally(new IOException(error));pending.clear();
    }
    JSONObject rpc(String method,JSONObject params)throws Exception{
        if(pairing==null)throw new IOException("Empareja primero tu ATLAS A1");
        String id=UUID.randomUUID().toString();String box=seal(object("id",id,"client",clientId,"device",deviceName,"method",method,"params",params));
        JSONObject reply;
        openRelay(); if(!relayReady.get(10,TimeUnit.SECONDS))throw new IOException("Relay rechazado");
        CompletableFuture<JSONObject> future=new CompletableFuture<>();pending.put(id,future);
        try {if(!relay.send(object("box",box).toString()))throw new IOException("Relay sin conexión");reply=future.get(40,TimeUnit.SECONDS);}
        finally{pending.remove(id);}
        if(!id.equals(reply.optString("id")))throw new SecurityException("Respuesta no correspondiente");
        if(reply.has("error"))throw new IOException(reply.getString("error"));return reply.getJSONObject("result");
    }

}
