package dev.atlas.a1;

import android.app.job.*;
import android.content.*;
import org.json.*;

/** Read-only; never opens voice or runs a shell command from the launcher. */
public final class WidgetRefreshJob extends JobService {
    static final int JOB_ID=8101;
    private volatile Thread worker;
    static void schedule(Context c){
        if(AtlasWidgetProvider.ids(c).length==0)return;
        JobScheduler scheduler=c.getSystemService(JobScheduler.class);
        if(scheduler.getPendingJob(JOB_ID)!=null)return;
        scheduler.schedule(new JobInfo.Builder(JOB_ID,new ComponentName(c,WidgetRefreshJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setOverrideDeadline(15000).build());
    }
    @Override public boolean onStartJob(JobParameters params){
        worker=new Thread(()->{
            try(AtlasConnection client=new AtlasConnection(this)){
                if(client.pairing==null)throw new IllegalStateException("Sin emparejar");
                // Do not let a result from a forgotten/replaced device reappear in widgets.
                String pair=getSharedPreferences("atlas",0).getString("pair",null);
                JSONObject result=client.rpc("status",new JSONObject());
                if(!Thread.currentThread().isInterrupted()&&java.util.Objects.equals(pair,getSharedPreferences("atlas",0).getString("pair",null)))
                    WidgetStore.prefs(this).edit().putString("status",result.toString()).putLong("time",System.currentTimeMillis()).remove("error").apply();
            }catch(Exception e){if(!Thread.currentThread().isInterrupted())WidgetStore.prefs(this).edit().putString("error","Sin conexión · datos guardados").apply();}
            if(!Thread.currentThread().isInterrupted()){AtlasWidgetProvider.updateAll(this);jobFinished(params,false);}
        },"atlas-widget-read");worker.start();return true;
    }
    @Override public boolean onStopJob(JobParameters params){if(worker!=null)worker.interrupt();return false;}
}
