package dev.atlas.a1;

import android.content.*;
import org.json.*;
import java.util.*;

final class WidgetStore {
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("atlas-widgets",Context.MODE_PRIVATE);}
    static JSONArray actions(Context c){try{return new JSONArray(prefs(c).getString("actions","[]"));}catch(Exception e){return new JSONArray();}}
    static JSONObject action(Context c,String id){JSONArray a=actions(c);for(int i=0;i<a.length();i++){JSONObject v=a.optJSONObject(i);if(v!=null&&id.equals(v.optString("id")))return v;}return null;}
    static void sync(Context c,JSONArray values)throws Exception{
        if(values.length()>100)throw new IllegalArgumentException("Máximo 100 botones");JSONArray clean=new JSONArray();Set<String> ids=new HashSet<>();
        for(int i=0;i<values.length();i++){
            JSONObject a=values.getJSONObject(i);String id=a.getString("id"),name=a.getString("name"),command=a.getString("command"),color=a.optString("color");
            if(!id.matches("[a-zA-Z0-9-]{1,80}")||!ids.add(id)||name.length()>120||command.length()>16000)throw new IllegalArgumentException("Botón inválido");
            clean.put(new JSONObject().put("id",id).put("name",name).put("command",command).put("icon",a.optString("icon","bolt")).put("color",color.matches("#[0-9a-fA-F]{6}")?color:"#53adff"));
        }
        prefs(c).edit().putString("actions",clean.toString()).apply();AtlasWidgetProvider.updateAll(c);
    }
    static String type(Context c,int id){return prefs(c).getString("type."+id,"status");}
    static void save(Context c,int id,String type,String action){prefs(c).edit().putString("type."+id,type).putString("action."+id,action).apply();}
    static void remove(Context c,int id){prefs(c).edit().remove("type."+id).remove("action."+id).apply();}
}
