package dev.atlas.a1;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.*;
import java.text.DateFormat;
import java.util.Date;

public class AtlasWidgetProvider extends AppWidgetProvider {
    static final String REFRESH="dev.atlas.a1.WIDGET_REFRESH";
    private static final Class<?>[] PROVIDERS={AtlasWidgetProvider.class,ActionWidgetProvider.class,QuotaWidgetProvider.class,CpuWidgetProvider.class,RamWidgetProvider.class,ChatWidgetProvider.class,VoiceWidgetProvider.class};
    protected String defaultType(){return "status";}
    static int[] ids(Context c){java.util.ArrayList<Integer> all=new java.util.ArrayList<>();AppWidgetManager m=AppWidgetManager.getInstance(c);for(Class<?> provider:PROVIDERS)for(int id:m.getAppWidgetIds(new ComponentName(c,provider)))all.add(id);int[] result=new int[all.size()];for(int i=0;i<all.size();i++)result[i]=all.get(i);return result;}
    static void updateAll(Context c){AppWidgetManager m=AppWidgetManager.getInstance(c);for(int id:ids(c))render(c,m,id,m.getAppWidgetOptions(id));}
    @Override public void onUpdate(Context c,AppWidgetManager m,int[] ids){for(int id:ids){if(WidgetStore.type(c,id).isEmpty())WidgetStore.save(c,id,defaultType(),"");render(c,m,id,m.getAppWidgetOptions(id));}WidgetRefreshJob.schedule(c);}
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options){render(c,m,id,options);}
    @Override public void onDeleted(Context c,int[] ids){for(int id:ids)WidgetStore.remove(c,id);}
    @Override public void onDisabled(Context c){c.getSystemService(android.app.job.JobScheduler.class).cancel(WidgetRefreshJob.JOB_ID);}
    @Override public void onReceive(Context c,Intent i){super.onReceive(c,i);if(REFRESH.equals(i.getAction())){WidgetStore.prefs(c).edit().putString("error","Actualizando…").apply();updateAll(c);WidgetRefreshJob.schedule(c);}}
    private static PendingIntent open(Context c,int id,String type,String action){
        Intent i=new Intent(c,MainActivity.class).setAction("dev.atlas.a1.WIDGET_OPEN").setData(Uri.parse("atlas-widget://open/"+id)).putExtra("widgetType",type).putExtra("actionId",action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c,id,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static void render(Context c,AppWidgetManager manager,int id,Bundle options){
        String type=WidgetStore.type(c,id),actionId=WidgetStore.prefs(c).getString("action."+id,"");if(type.isEmpty())type="status";
        boolean wide=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,110)>=220;
        boolean tall=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,110)>=210;
        boolean details=wide&&tall;
        RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.atlas_widget);
        String title="ATLAS A1",value="",hint="",body="",icon="spark",color="#53adff";
        JSONObject s;try{s=new JSONObject(WidgetStore.prefs(c).getString("status","{}"));}catch(Exception e){s=new JSONObject();}
        boolean paired=c.getSharedPreferences("atlas",0).contains("pair");
        long stamp=WidgetStore.prefs(c).getLong("time",0);String error=WidgetStore.prefs(c).getString("error","");
        String age=stamp==0?"Sin lectura":DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(stamp));
        boolean stale=stamp>0&&System.currentTimeMillis()-stamp>45*60*1000;
        if(type.equals("action")){
            JSONObject a=WidgetStore.action(c,actionId);title="ACCIÓN · A1";
            value=a==null?"Configura tu botón":a.optString("name");hint=a==null?"Toca ···":"Ejecutar ahora";
            if(a!=null){icon=a.optString("icon","bolt");color=a.optString("color",color);body="Acción directa en ATLAS A1.";}
        }else if(type.equals("chat")){title="ATLAS · CHAT";value="¿Qué tienes\nen mente?";hint="Abrir conversación";body="Escribe a Atlas y recibe su respuesta en directo.";
        }else if(type.equals("voice")){title="ATLAS · VOZ";value="Habla\ncon Atlas";hint="Abrir Pulsar";icon="mic";body="Abre Pulsar, prepara la voz y mantén el botón para hablar. El micrófono no se activa desde el escritorio.";
        }else if(type.equals("quota")){
            title="CODEX · CUOTAS";icon="activity";JSONObject usage=s.optJSONObject("usage");
            value="5 h   "+remaining(usage,"fiveHour")+"\nSemana   "+remaining(usage,"weekly");
            hint="Disponible · "+age;body=reset(usage,"fiveHour","5 horas")+"\n"+reset(usage,"weekly","Semana");
        }else if(type.equals("cpu")){
            title="A1 · CPU";icon="activity";value=s.isNull("temperatureC")?"—":String.format(java.util.Locale.ROOT,"%.1f °C",s.optDouble("temperatureC"));hint=age;body="Temperatura actual del procesador";
        }else if(type.equals("ram")){
            title="A1 · RAM";icon="monitor";JSONObject memory=s.optJSONObject("memory");double total=memory==null?0:memory.optDouble("MemTotal"),available=memory==null?0:memory.optDouble("MemAvailable");value=total<=0?"—":Math.round((1-available/total)*100)+"%";hint=age;body="Memoria utilizada";
        }else{
            title="ATLAS · ESTADO";icon="device";
            JSONArray services=s.optJSONArray("services");int active=0,total=services==null?0:services.length();StringBuilder list=new StringBuilder();
            for(int i=0;i<total;i++){JSONObject service=services.optJSONObject(i);if(service==null)continue;String name=service.optString("name").replace(".service","").replace("atlas-","");boolean ok="active".equals(service.optString("active"));if(ok)active++;list.append(ok?"● ":"○ ").append(name).append(" · ").append(service.optString("active","—")).append('\n');}
            value=stamp==0?"Sin lectura":active+" / "+total+" activos";
            JSONObject net=s.optJSONObject("network"),wifi=net==null?null:net.optJSONObject("wifi");
            hint=(wifi==null?"Wi-Fi sin datos":wifi.optString("ssid","Sin Wi-Fi"))+" · "+age;
            body=list.toString();if(s.has("temperatureC")&&!s.isNull("temperatureC"))body+="\nCPU · "+s.optDouble("temperatureC")+" °C";
        }
        boolean status=type.equals("status")||type.equals("quota");
        if(status&&!paired){value="Conecta tu A1";hint="Empareja desde Ajustes";body="";}
        else if(status&&!error.isEmpty()){hint=error+" · "+age;}
        else if(status&&stale)hint="Lectura antigua · "+age;
        v.setTextViewText(R.id.widget_title,title);v.setTextViewText(R.id.widget_value,value);v.setTextViewText(R.id.widget_hint,hint);v.setTextViewText(R.id.widget_details,body.trim());
        v.setTextViewTextSize(R.id.widget_value,android.util.TypedValue.COMPLEX_UNIT_SP,wide?23:17);
        v.setViewVisibility(R.id.widget_details,details?View.VISIBLE:View.GONE);
        int resource=c.getResources().getIdentifier("widget_icon_"+icon,"drawable",c.getPackageName());v.setImageViewResource(R.id.widget_icon,resource==0?R.drawable.widget_icon_bolt:resource);
        v.setInt(R.id.widget_icon,"setColorFilter",Color.parseColor(color));
        v.setOnClickPendingIntent(R.id.widget_content,open(c,id,type,actionId));
        Intent setup=new Intent(c,WidgetConfigureActivity.class).setData(Uri.parse("atlas-widget://configure/"+id)).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id);
        v.setOnClickPendingIntent(R.id.widget_configure,PendingIntent.getActivity(c,id,setup,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        Intent refresh=new Intent(c,AtlasWidgetProvider.class).setAction(REFRESH);
        v.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(c,0,refresh,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        v.setViewVisibility(R.id.widget_refresh,status?View.VISIBLE:View.GONE);
        manager.updateAppWidget(id,v);
    }
    private static String remaining(JSONObject usage,String key){JSONObject q=usage==null?null:usage.optJSONObject(key);return q==null||q.isNull("remainingPercent")?"—":q.optInt("remainingPercent")+"%";}
    private static String reset(JSONObject usage,String key,String name){
        JSONObject q=usage==null?null:usage.optJSONObject(key);if(q==null||q.isNull("resetAt"))return name+" · renovación no disponible";
        try{Object raw=q.get("resetAt");Date date=raw instanceof Number?new Date(((Number)raw).longValue()):Date.from(java.time.Instant.parse(String.valueOf(raw)));return name+" · renueva "+DateFormat.getDateTimeInstance(DateFormat.SHORT,DateFormat.SHORT).format(date);}
        catch(Exception e){return name+" · renovación no disponible";}
    }
}
