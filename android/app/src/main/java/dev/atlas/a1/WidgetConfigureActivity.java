package dev.atlas.a1;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.os.Bundle;
import android.graphics.Color;
import android.view.*;
import android.widget.*;
import org.json.*;

public final class WidgetConfigureActivity extends Activity {
    private final String[] kinds={"action","status","quota","chat","voice"};
    @Override public void onCreate(Bundle state){
        setTheme(R.style.AtlasTheme);super.onCreate(state);setResult(RESULT_CANCELED);
        int id=getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID);
        if(id==AppWidgetManager.INVALID_APPWIDGET_ID){finish();return;}
        getWindow().setStatusBarColor(0xff080f20);getWindow().setNavigationBarColor(0xff080f20);
        getWindow().getInsetsController().setSystemBarsAppearance(0,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(28,32,28,24);content.setBackgroundColor(0xff080f20);
        content.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets b=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(28,b.top+32,28,b.bottom+24);return WindowInsets.CONSUMED;});
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.addView(content);setContentView(scroll);content.requestApplyInsets();
        TextView title=text("Tu Atlas, a un toque.",27);content.addView(title);
        content.addView(text("Elige el contenido. Después puedes mantener pulsado el widget en tu pantalla de inicio para cambiar su tamaño, desde 2×2.",15));
        Spinner type=new Spinner(this);type.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"Botón guardado","Estado de A1","Límites de Codex","Chat con Atlas","Hablar · Pulsar"}));content.addView(type);
        JSONArray actions=WidgetStore.actions(this);String[] names=new String[Math.max(1,actions.length())];
        if(actions.length()==0)names[0]="Crea primero un botón en ATLAS";else for(int i=0;i<actions.length();i++)names[i]=actions.optJSONObject(i).optString("name");
        Spinner action=new Spinner(this);action.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names));content.addView(action);
        TextView detail=text("",15);content.addView(detail);
        type.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> p){}public void onItemSelected(AdapterView<?> p,View v,int position,long item){action.setVisibility(position==0?View.VISIBLE:View.GONE);detail.setText(position==0?"El botón conserva su icono y color. La app confirma el comando y aplica tu protección biométrica.":position<3?"Lecturas reales con hora visible. Actualización periódica sujeta a la batería y la red; también puedes refrescar a mano. Estos datos serán visibles en tu pantalla de inicio.":"Abre directamente esta modalidad de Atlas. Por seguridad y límites de Android, escribir o mantener pulsado para grabar se hace dentro de la app.");}});
        String saved=WidgetStore.type(this,id);for(int i=0;i<kinds.length;i++)if(kinds[i].equals(saved))type.setSelection(i);
        String savedAction=WidgetStore.prefs(this).getString("action."+id,"");for(int i=0;i<actions.length();i++)if(savedAction.equals(actions.optJSONObject(i).optString("id")))action.setSelection(i);
        Button save=new Button(this);save.setText("Guardar widget");content.addView(save);
        save.setOnClickListener(v->{int index=type.getSelectedItemPosition();if(index==0&&actions.length()==0){Toast.makeText(this,"Abre ATLAS y crea un botón en Control de A1",Toast.LENGTH_LONG).show();return;}
            String selected=index==0?actions.optJSONObject(action.getSelectedItemPosition()).optString("id"):"";
            WidgetStore.save(this,id,kinds[index],selected);AtlasWidgetProvider.updateAll(this);WidgetRefreshJob.schedule(this);
            setResult(RESULT_OK,new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id));finish();});
    }
    private TextView text(String value,int size){TextView v=new TextView(this);v.setText(value);v.setTextColor(Color.rgb(234,241,253));v.setTextSize(size);v.setPadding(0,12,0,24);return v;}
}
