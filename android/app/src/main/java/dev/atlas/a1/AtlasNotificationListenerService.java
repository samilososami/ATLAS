package dev.atlas.a1;

import android.content.*;
import android.provider.Settings;
import android.service.notification.*;
import org.json.*;

public final class AtlasNotificationListenerService extends NotificationListenerService {
    private static volatile AtlasNotificationListenerService instance;
    @Override public void onListenerConnected(){instance=this;}
    @Override public void onListenerDisconnected(){instance=null;}
    @Override public void onDestroy(){instance=null;super.onDestroy();}
    static boolean enabled(Context context){
        String value=Settings.Secure.getString(context.getContentResolver(),"enabled_notification_listeners");
        return value!=null&&value.contains(new ComponentName(context,AtlasNotificationListenerService.class).flattenToString());
    }
    static JSONArray active()throws Exception{
        AtlasNotificationListenerService service=instance;if(service==null)throw new SecurityException("permission_required: NOTIFICATION_LISTENER");
        JSONArray result=new JSONArray();for(StatusBarNotification item:service.getActiveNotifications()){
            android.app.Notification notification=item.getNotification();JSONObject value=new JSONObject().put("package",item.getPackageName()).put("postedAt",item.getPostTime());
            CharSequence title=notification.extras.getCharSequence(android.app.Notification.EXTRA_TITLE),text=notification.extras.getCharSequence(android.app.Notification.EXTRA_TEXT);
            value.put("title",title==null?"":title.toString()).put("text",text==null?"":text.toString());result.put(value);if(result.length()>=80)break;
        }return result;
    }
}
