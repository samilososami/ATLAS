package dev.atlas.a1;

import android.app.*;import android.appwidget.*;import android.content.*;import android.graphics.Color;import android.os.Bundle;import android.view.*;import android.widget.*;import org.json.*;

public final class WidgetConfigureActivity extends Activity {
    @Override public void onCreate(Bundle state){
        setTheme(R.style.AtlasTheme);super.onCreate(state);setResult(RESULT_CANCELED);
        int id=getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID);if(id==AppWidgetManager.INVALID_APPWIDGET_ID){finish();return;}
        AppWidgetProviderInfo info=AppWidgetManager.getInstance(this).getAppWidgetInfo(id);String cls=info==null?"":info.provider.getClassName();String type=cls.endsWith("ActionWidgetProvider")?"action":cls.endsWith("QuotaWidgetProvider")?"quota":cls.endsWith("CpuWidgetProvider")?"cpu":cls.endsWith("RamWidgetProvider")?"ram":cls.endsWith("ChatWidgetProvider")?"chat":cls.endsWith("VoiceWidgetProvider")?"voice":"status";
        if(!"action".equals(type)){finishWidget(id,type,"");return;}
        getWindow().setStatusBarColor(0xff080f20);getWindow().setNavigationBarColor(0xff080f20);
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(28,36,28,24);content.setBackgroundColor(0xff080f20);ScrollView scroll=new ScrollView(this);scroll.addView(content);setContentView(scroll);
        content.addView(text("Elige un botón",28));content.addView(text("Cada botón creado en ATLAS puede convertirse en un widget 2×2 o mayor.",14));
        JSONArray actions=WidgetStore.actions(this);String[] names=new String[Math.max(1,actions.length())];if(actions.length()==0)names[0]="Crea primero un botón en ATLAS";else for(int i=0;i<actions.length();i++)names[i]=actions.optJSONObject(i).optString("name");
        Spinner action=new Spinner(this);action.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names));content.addView(action);
        Button save=new Button(this);save.setText("Añadir widget");content.addView(save);save.setOnClickListener(v->{if(actions.length()==0){Toast.makeText(this,"Abre ATLAS y crea un botón",Toast.LENGTH_LONG).show();return;}finishWidget(id,"action",actions.optJSONObject(action.getSelectedItemPosition()).optString("id"));});
    }
    private void finishWidget(int id,String type,String action){WidgetStore.save(this,id,type,action);AppWidgetManager m=AppWidgetManager.getInstance(this);AtlasWidgetProvider.render(this,m,id,m.getAppWidgetOptions(id));WidgetRefreshJob.schedule(this);setResult(RESULT_OK,new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish();}
    private TextView text(String value,int size){TextView v=new TextView(this);v.setText(value);v.setTextColor(Color.rgb(234,241,253));v.setTextSize(size);v.setPadding(0,10,0,22);return v;}
}
