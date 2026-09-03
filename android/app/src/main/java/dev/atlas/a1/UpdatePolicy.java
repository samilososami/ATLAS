package dev.atlas.a1;

import java.net.URI;
import java.util.regex.*;

/** Pure, testable boundary for public Android release assets. */
final class UpdatePolicy {
    static final String REPO="samilososami/ATLAS";
    static final long MAX_APK=80L*1024*1024;
    static long[] version(String text) {
        Matcher m=Pattern.compile("^(?:android-v)?(\\d{1,6})\\.(\\d{1,6})\\.(\\d{1,6})(?:-preview)?$").matcher(text);
        if(!m.matches())throw new IllegalArgumentException("Versión Android no reconocida");
        return new long[]{Long.parseLong(m.group(1)),Long.parseLong(m.group(2)),Long.parseLong(m.group(3))};
    }
    static int compare(String a,String b){long[] x=version(a),y=version(b);for(int i=0;i<3;i++){int c=Long.compare(x[i],y[i]);if(c!=0)return c;}return 0;}
    static boolean asset(String url,String tag,String name){
        try{
            if(!tag.startsWith("android-v"))return false;
            version(tag);
            String v=tag.substring(9);
            if(!name.equals("ATLAS-"+v+".apk")&&!name.equals("ATLAS-"+v+"-preview.apk"))return false;
            URI u=URI.create(url);
            return "https".equals(u.getScheme())&&"github.com".equals(u.getHost())&&u.getPort()==-1&&u.getUserInfo()==null&&u.getQuery()==null&&u.getFragment()==null
                &&u.getRawPath().equals("/"+REPO+"/releases/download/"+tag+"/"+name);
        }catch(Exception e){return false;}
    }
}
