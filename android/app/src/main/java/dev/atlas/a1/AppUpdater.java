package dev.atlas.a1;

import android.content.Context;
import android.content.pm.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.TimeUnit;
import okhttp3.*;
import org.json.*;

final class AppUpdater {
    interface Progress { void update(int percent); }
    private final Context context;
    private JSONObject candidate;
    private final OkHttpClient http=new OkHttpClient.Builder().callTimeout(80,TimeUnit.SECONDS).followSslRedirects(false).build();
    private final OkHttpClient downloads=new OkHttpClient.Builder().callTimeout(80,TimeUnit.SECONDS).followRedirects(true).followSslRedirects(true).build();
    AppUpdater(Context context){this.context=context.getApplicationContext();}
    private Request request(String url){return new Request.Builder().url(url).header("User-Agent","ATLAS-Android-Updater").header("Accept","application/vnd.github+json").build();}
    private String read(String url)throws Exception{
        try(Response r=http.newCall(request(url)).execute()){
            if(!r.isSuccessful())throw new IOException(r.code()==403||r.code()==429?"GitHub limita las consultas. Inténtalo más tarde.":"GitHub no respondió (HTTP "+r.code()+")");
            if(r.body()==null)throw new IOException("GitHub devolvió una respuesta vacía");
            try(InputStream in=r.body().byteStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[16384];int total=0,n;while((n=in.read(buffer))!=-1){total+=n;if(total>4*1024*1024)throw new IOException("Respuesta de GitHub demasiado grande");out.write(buffer,0,n);}
                return out.toString(java.nio.charset.StandardCharsets.UTF_8.name());
            }
        }
    }
    synchronized JSONObject check()throws Exception{
        candidate=null;String current=context.getPackageManager().getPackageInfo(context.getPackageName(),0).versionName;
        // /latest excludes preview releases. This project deliberately publishes previews.
        JSONArray releases=new JSONArray(read("https://api.github.com/repos/"+UpdatePolicy.REPO+"/releases?per_page=100"));
        for(int i=0;i<releases.length();i++){
            JSONObject r=releases.getJSONObject(i);String tag=r.optString("tag_name");
            if(r.optBoolean("draft")||!tag.startsWith("android-v"))continue;
            try{if(UpdatePolicy.compare(tag,current)<=0||candidate!=null&&UpdatePolicy.compare(tag,candidate.getString("tag"))<=0)continue;}catch(IllegalArgumentException e){continue;}
            JSONArray assets=r.optJSONArray("assets");if(assets==null)continue;
            for(int j=0;j<assets.length();j++){
                JSONObject a=assets.getJSONObject(j);String url=a.optString("browser_download_url"),name=a.optString("name"),digest=a.optString("digest");long size=a.optLong("size");
                if(!UpdatePolicy.asset(url,tag,name)||size<=0||size>UpdatePolicy.MAX_APK||!digest.matches("sha256:[0-9a-fA-F]{64}"))continue;
                candidate=new JSONObject().put("id",r.getLong("id")).put("tag",tag).put("version",tag.substring(9)).put("url",url).put("size",size).put("sha256",digest.substring(7).toLowerCase(Locale.ROOT))
                    .put("notes",r.optString("body","Sin notas de versión.")).put("preview",r.optBoolean("prerelease"));break;
            }
        }
        JSONObject result=new JSONObject().put("current",current).put("available",candidate!=null);
        if(candidate!=null)result.put("release",new JSONObject(candidate.toString()));return result;
    }
    synchronized File download(long releaseId,Progress progress)throws Exception{
        if(candidate==null||candidate.getLong("id")!=releaseId)throw new IOException("Busca actualizaciones de nuevo antes de descargar");
        File apk=new File(context.getCacheDir(),"atlas-update.apk");
        if(apk.isFile()&&hash(apk).equals(candidate.getString("sha256"))){validate(apk);return apk;}
        if(apk.exists()&&!apk.delete())throw new IOException("No se pudo sustituir una descarga anterior");
        File part=new File(context.getCacheDir(),"atlas-update.part");
        try(Response r=downloads.newCall(request(candidate.getString("url"))).execute()){
            if(!r.isSuccessful()||r.body()==null)throw new IOException("No se pudo descargar la APK (HTTP "+r.code()+")");
            String finalScheme=r.request().url().scheme(),finalHost=r.request().url().host();
            if(!"https".equals(finalScheme)||!("github.com".equals(finalHost)||finalHost.endsWith(".githubusercontent.com")))throw new SecurityException("GitHub redirigió la descarga a un servidor no autorizado");
            // HTTPS redirects are allowed only to GitHub's signed release-assets CDN.
            long size=candidate.getLong("size"),total=0;int last=-1;
            try(InputStream in=r.body().byteStream();OutputStream out=new FileOutputStream(part)){
                byte[] buf=new byte[32768];int n;while((n=in.read(buf))!=-1){total+=n;if(total>size||total>UpdatePolicy.MAX_APK)throw new IOException("Tamaño de actualización incorrecto");out.write(buf,0,n);int p=(int)(total*100/size);if(p!=last){last=p;progress.update(p);}}
            }
            if(total!=size||!hash(part).equals(candidate.getString("sha256")))throw new SecurityException("La descarga no supera la comprobación SHA-256. No se instalará.");
            validate(part);
            if(!part.renameTo(apk))throw new IOException("No se pudo preparar la APK");return apk;
        }finally{if(part.exists())part.delete();}
    }
    private String hash(File f)throws Exception{MessageDigest md=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1)md.update(b,0,n);}StringBuilder out=new StringBuilder();for(byte x:md.digest())out.append(String.format("%02x",x));return out.toString();}
    private static Set<String> signers(PackageInfo p){
        Set<String> values=new HashSet<>();if(p.signingInfo!=null)for(Signature s:p.signingInfo.getApkContentsSigners())values.add(s.toCharsString());return values;
    }
    private void validate(File apk)throws Exception{
        PackageManager pm=context.getPackageManager();PackageInfo installed=pm.getPackageInfo(context.getPackageName(),PackageManager.GET_SIGNING_CERTIFICATES);
        PackageInfo incoming=pm.getPackageArchiveInfo(apk.getAbsolutePath(),PackageManager.GET_SIGNING_CERTIFICATES);
        if(incoming==null||!context.getPackageName().equals(incoming.packageName))throw new SecurityException("Esta APK no corresponde a ATLAS");
        if(incoming.getLongVersionCode()<=installed.getLongVersionCode())throw new SecurityException("Esta APK no es más reciente que la instalada");
        if(signers(installed).isEmpty()||!signers(installed).equals(signers(incoming)))throw new SecurityException("La firma de la actualización no coincide con ATLAS");
    }
}
