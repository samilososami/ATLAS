package dev.atlas.a1;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.hardware.*;
import android.location.*;
import android.net.Uri;
import android.os.*;
import android.provider.*;
import android.telephony.SmsManager;
import android.telecom.TelecomManager;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Native-first phone tools. Every call arrives through the authenticated pairing channel. */
final class AtlasPhoneTools {
    static JSONObject execute(Context context,String requestedMethod,JSONObject p)throws Exception{
        String method=requestedMethod.startsWith("control.")?requestedMethod.substring("control.".length()):requestedMethod;
        if(method.startsWith("androiduse.")){p.put("action",method.substring("androiduse.".length()));return AtlasAccessibilityService.execute(p);}
        switch(method){
            case "capabilities": case "phone.capabilities": return capabilities(context);
            case "call": case "phone.call": return call(context,p);
            case "sms.send": return sendSms(context,p);
            case "sms.unread": return unreadSms(context);
            case "sms.list": return listSms(context,p);
            case "calls.recent": return recentCalls(context,p);
            case "contacts.search": return contacts(context,p);
            case "calendar.list": return calendar(context,p);
            case "calendar.create": return createCalendar(context,p);
            case "calendar.update": return updateCalendar(context,p);
            case "calendar.delete": return deleteCalendar(context,p);
            case "location.get": return location(context);
            case "notifications.list": return new JSONObject().put("notifications",AtlasNotificationListenerService.active());
            case "notifications.show": return showNotification(context,p);
            case "notifications.access": return requestUserAction(context,new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),"Permite a ATLAS leer notificaciones","Toca para abrir el acceso a notificaciones",93);
            case "wifi.panel": return openWifiPanel(context);
            case "wifi.connect": throw new UnsupportedOperationException("unsupported: Android 10+ no permite garantizar una conexión Wi-Fi silenciosa; usa wifi.panel o Android Use");
            case "phone.answer": throw new UnsupportedOperationException("unsupported: contestar llamadas exige que ATLAS sea la app de teléfono predeterminada y un InCallService aprobado por el usuario");
            case "files.list": return files(p);
            case "files.read": return readFile(p);
            case "files.move": return moveFile(p);
            case "files.delete": return deleteFile(p);
            case "media.recent": case "media.list": return media(context,p);
            case "media.delete": return deleteMedia(context,p);
            case "camera.photo": return camera(context,false);
            case "camera.video": return camera(context,true);
            case "sensors.summary": return sensors(context);
            default: throw new SecurityException("Herramienta Android no permitida: "+requestedMethod);
        }
    }
    private static void require(Context context,String...permissions){for(String permission:permissions)if(!granted(context,permission))throw new SecurityException("permission_required: "+permission.substring(permission.lastIndexOf('.')+1));}
    private static boolean granted(Context context,String permission){return context.checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED;}
    private static JSONObject capabilities(Context context)throws Exception{
        PackageManager packageManager=context.getPackageManager();
        boolean accessibility=AtlasAccessibilityService.enabled(context),notificationAccess=AtlasNotificationListenerService.enabled(context);
        boolean locationFine=granted(context,Manifest.permission.ACCESS_FINE_LOCATION),locationCoarse=granted(context,Manifest.permission.ACCESS_COARSE_LOCATION);
        boolean contactsRead=granted(context,Manifest.permission.READ_CONTACTS),contactsWrite=granted(context,Manifest.permission.WRITE_CONTACTS);
        boolean calendarRead=granted(context,Manifest.permission.READ_CALENDAR),calendarWrite=granted(context,Manifest.permission.WRITE_CALENDAR);
        boolean phoneCall=granted(context,Manifest.permission.CALL_PHONE),phoneState=granted(context,Manifest.permission.READ_PHONE_STATE);
        boolean callLogRead=granted(context,Manifest.permission.READ_CALL_LOG),callLogWrite=granted(context,Manifest.permission.WRITE_CALL_LOG);
        boolean smsRead=granted(context,Manifest.permission.READ_SMS),smsSend=granted(context,Manifest.permission.SEND_SMS),smsReceive=granted(context,Manifest.permission.RECEIVE_SMS);
        boolean legacyMediaRead=granted(context,Manifest.permission.READ_EXTERNAL_STORAGE);
        boolean mediaImagesRead=Build.VERSION.SDK_INT<33?legacyMediaRead:granted(context,Manifest.permission.READ_MEDIA_IMAGES);
        boolean mediaVideoRead=Build.VERSION.SDK_INT<33?legacyMediaRead:granted(context,Manifest.permission.READ_MEDIA_VIDEO);
        boolean mediaAudioRead=Build.VERSION.SDK_INT<33?legacyMediaRead:granted(context,Manifest.permission.READ_MEDIA_AUDIO);
        boolean cameraPermission=granted(context,Manifest.permission.CAMERA);
        boolean activityRecognition=granted(context,Manifest.permission.ACTIVITY_RECOGNITION),bodySensors=granted(context,Manifest.permission.BODY_SENSORS);
        boolean overlay=Settings.canDrawOverlays(context);
        boolean bluetoothScan=Build.VERSION.SDK_INT<31||granted(context,Manifest.permission.BLUETOOTH_SCAN);
        boolean bluetoothConnect=Build.VERSION.SDK_INT<31||granted(context,Manifest.permission.BLUETOOTH_CONNECT);
        boolean wifiNearby=Build.VERSION.SDK_INT<33||granted(context,Manifest.permission.NEARBY_WIFI_DEVICES);
        boolean wifiState=granted(context,Manifest.permission.ACCESS_WIFI_STATE),wifiChange=granted(context,Manifest.permission.CHANGE_WIFI_STATE);
        boolean notificationsPost=Build.VERSION.SDK_INT<33||granted(context,Manifest.permission.POST_NOTIFICATIONS);
        boolean allFilesAccess=Environment.isExternalStorageManager();
        boolean telephony=packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
        boolean cameraHardware=packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY);
        boolean bluetoothHardware=packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH);
        boolean wifiHardware=packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI);
        boolean sensorHardware=context.getSystemService(SensorManager.class)!=null;
        boolean cameraPhoto=new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).resolveActivity(packageManager)!=null;
        boolean cameraVideo=new Intent(MediaStore.INTENT_ACTION_VIDEO_CAMERA).resolveActivity(packageManager)!=null;
        boolean mediaList=mediaImagesRead&&mediaVideoRead&&mediaAudioRead;

        JSONObject permissions=new JSONObject()
            .put("locationFine",locationFine).put("locationCoarse",locationCoarse)
            .put("contactsRead",contactsRead).put("contactsWrite",contactsWrite)
            .put("calendarRead",calendarRead).put("calendarWrite",calendarWrite)
            .put("phoneCall",phoneCall).put("phoneState",phoneState)
            .put("callLogRead",callLogRead).put("callLogWrite",callLogWrite)
            .put("smsRead",smsRead).put("smsSend",smsSend).put("smsReceive",smsReceive)
            .put("mediaImagesRead",mediaImagesRead).put("mediaVideoRead",mediaVideoRead).put("mediaAudioRead",mediaAudioRead)
            .put("camera",cameraPermission).put("activityRecognition",activityRecognition).put("bodySensors",bodySensors)
            .put("overlay",overlay).put("bluetoothScan",bluetoothScan).put("bluetoothConnect",bluetoothConnect)
            .put("wifiNearby",wifiNearby).put("wifiState",wifiState).put("wifiChange",wifiChange)
            .put("notificationsPost",notificationsPost).put("notificationAccess",notificationAccess)
            .put("allFilesAccess",allFilesAccess).put("accessibility",accessibility);
        JSONObject operations=new JSONObject()
            .put("phone.call",phoneCall&&telephony).put("calls.recent",callLogRead)
            .put("sms.send",smsSend&&telephony).put("sms.unread",smsRead).put("sms.list",smsRead)
            .put("contacts.search",contactsRead)
            .put("calendar.list",calendarRead).put("calendar.create",calendarWrite).put("calendar.update",calendarWrite).put("calendar.delete",calendarWrite)
            .put("location.get",locationFine).put("notifications.list",notificationAccess).put("notifications.show",notificationsPost).put("notifications.access",true)
            .put("wifi.panel",wifiHardware).put("files.list",allFilesAccess).put("files.read",allFilesAccess).put("files.move",allFilesAccess).put("files.delete",allFilesAccess)
            .put("media.list",mediaList).put("media.delete",true)
            .put("camera.photo",cameraPhoto).put("camera.video",cameraVideo).put("sensors.summary",sensorHardware).put("androiduse",accessibility);
        JSONObject hardware=new JSONObject().put("telephony",telephony).put("camera",cameraHardware).put("bluetooth",bluetoothHardware).put("wifi",wifiHardware).put("sensors",sensorHardware);

        // Keep the original flat keys stable for older clients while exposing exact permission and operation detail.
        return new JSONObject().put("accessibility",accessibility).put("notificationAccess",notificationAccess)
            .put("location",locationFine).put("contacts",contactsRead).put("calendar",calendarRead)
            .put("phone",phoneCall).put("sms",smsSend).put("files",allFilesAccess)
            .put("permissions",permissions).put("operations",operations).put("hardware",hardware);
    }
    private static JSONObject call(Context context,JSONObject p)throws Exception{
        if(context.checkSelfPermission(Manifest.permission.CALL_PHONE)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("permission_required: CALL_PHONE");String number=p.optString("number").replaceAll("[^+0-9*#]","");if(number.length()<3)throw new IllegalArgumentException("Número no válido");
        TelecomManager telecom=context.getSystemService(TelecomManager.class);if(telecom==null)throw new UnsupportedOperationException("unsupported: este dispositivo no ofrece telefonía");telecom.placeCall(Uri.parse("tel:"+Uri.encode(number)),Bundle.EMPTY);return new JSONObject().put("initiated",true);
    }
    @SuppressWarnings("deprecation") private static JSONObject sendSms(Context context,JSONObject p)throws Exception{
        require(context,Manifest.permission.SEND_SMS);String number=p.optString("number").replaceAll("[^+0-9]",""),text=p.optString("text");if(number.length()<3||text.isBlank())throw new IllegalArgumentException("Destinatario o mensaje no válido");
        SmsManager manager=SmsManager.getDefault();ArrayList<String> parts=manager.divideMessage(text);
        if(parts.size()<=1)manager.sendTextMessage(number,null,text,null,null);else manager.sendMultipartTextMessage(number,null,parts,null,null);
        return new JSONObject().put("queued",true).put("parts",parts.size());
    }
    private static JSONObject unreadSms(Context context)throws Exception{
        require(context,Manifest.permission.READ_SMS);JSONArray values=new JSONArray();try(Cursor cursor=context.getContentResolver().query(Uri.parse("content://sms/inbox"),new String[]{"address","body","date"},"read=0",null,"date DESC")){
            if(cursor!=null)while(cursor.moveToNext()&&values.length()<50)values.put(new JSONObject().put("from",cursor.getString(0)).put("text",cursor.getString(1)).put("date",cursor.getLong(2)));
        }return new JSONObject().put("messages",values);
    }
    private static JSONObject listSms(Context context,JSONObject p)throws Exception{
        require(context,Manifest.permission.READ_SMS);JSONArray values=new JSONArray();int limit=Math.max(1,Math.min(100,p.optInt("limit",30)));String box=p.optString("box","all");Uri uri="inbox".equals(box)?Uri.parse("content://sms/inbox"):"sent".equals(box)?Uri.parse("content://sms/sent"):Uri.parse("content://sms");
        try(Cursor cursor=context.getContentResolver().query(uri,new String[]{"address","body","date","type","read"},null,null,"date DESC")){if(cursor!=null)while(cursor.moveToNext()&&values.length()<limit)values.put(new JSONObject().put("address",cursor.getString(0)).put("text",cursor.getString(1)).put("date",cursor.getLong(2)).put("type",cursor.getInt(3)).put("read",cursor.getInt(4)!=0));}
        return new JSONObject().put("messages",values);
    }
    private static JSONObject recentCalls(Context context,JSONObject p)throws Exception{
        require(context,Manifest.permission.READ_CALL_LOG);JSONArray values=new JSONArray();int limit=Math.max(1,Math.min(100,p.optInt("limit",30)));
        try(Cursor cursor=context.getContentResolver().query(CallLog.Calls.CONTENT_URI,new String[]{CallLog.Calls.NUMBER,CallLog.Calls.CACHED_NAME,CallLog.Calls.TYPE,CallLog.Calls.DATE,CallLog.Calls.DURATION},null,null,CallLog.Calls.DATE+" DESC")){if(cursor!=null)while(cursor.moveToNext()&&values.length()<limit)values.put(new JSONObject().put("number",cursor.getString(0)).put("name",cursor.getString(1)==null?"":cursor.getString(1)).put("type",cursor.getInt(2)).put("date",cursor.getLong(3)).put("durationSeconds",cursor.getLong(4)));}
        return new JSONObject().put("calls",values);
    }
    private static JSONObject contacts(Context context,JSONObject p)throws Exception{
        require(context,Manifest.permission.READ_CONTACTS);String query=p.optString("query");JSONArray values=new JSONArray();String like="%"+query.replace("%","\\%").replace("_","\\_")+"%";
        try(Cursor cursor=context.getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,ContactsContract.CommonDataKinds.Phone.NUMBER},ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME+" LIKE ?",new String[]{like},ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME+" ASC")){
            if(cursor!=null)while(cursor.moveToNext()&&values.length()<30)values.put(new JSONObject().put("name",cursor.getString(0)).put("number",cursor.getString(1)));
        }return new JSONObject().put("contacts",values);
    }
    private static JSONObject calendar(Context context,JSONObject p)throws Exception{
        require(context,Manifest.permission.READ_CALENDAR);long from=p.optLong("from",System.currentTimeMillis()),to=p.optLong("to",from+7L*86400000L);if(to<from)throw new IllegalArgumentException("El final del intervalo no puede ser anterior al inicio");JSONArray values=new JSONArray();
        Uri uri=CalendarContract.Instances.CONTENT_URI.buildUpon().appendPath(Long.toString(from)).appendPath(Long.toString(to)).build();
        try(Cursor cursor=context.getContentResolver().query(uri,new String[]{CalendarContract.Instances.EVENT_ID,CalendarContract.Instances.TITLE,CalendarContract.Instances.BEGIN,CalendarContract.Instances.END,CalendarContract.Instances.EVENT_LOCATION,CalendarContract.Instances.CALENDAR_ID,CalendarContract.Instances.CALENDAR_DISPLAY_NAME},null,null,CalendarContract.Instances.BEGIN+" ASC")){
            if(cursor!=null)while(cursor.moveToNext()&&values.length()<80)values.put(new JSONObject().put("id",cursor.getLong(0)).put("title",cursor.getString(1)==null?"":cursor.getString(1)).put("begin",cursor.getLong(2)).put("end",cursor.getLong(3)).put("location",cursor.getString(4)==null?"":cursor.getString(4)).put("calendarId",cursor.getLong(5)).put("calendarName",cursor.getString(6)==null?"":cursor.getString(6)));
        }
        JSONArray calendars=new JSONArray(),editableCalendars=new JSONArray();
        String[] columns={CalendarContract.Calendars._ID,CalendarContract.Calendars.NAME,CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,CalendarContract.Calendars.ACCOUNT_NAME,CalendarContract.Calendars.ACCOUNT_TYPE,CalendarContract.Calendars.OWNER_ACCOUNT,CalendarContract.Calendars.VISIBLE,CalendarContract.Calendars.SYNC_EVENTS,CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,CalendarContract.Calendars.IS_PRIMARY};
        try(Cursor cursor=context.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI,columns,null,null,CalendarContract.Calendars.CALENDAR_DISPLAY_NAME+" COLLATE NOCASE ASC")){
            if(cursor!=null)while(cursor.moveToNext()&&calendars.length()<100){int accessLevel=cursor.getInt(8);boolean editable=accessLevel>=CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;JSONObject item=new JSONObject().put("id",cursor.getLong(0)).put("name",cursor.getString(1)==null?"":cursor.getString(1)).put("displayName",cursor.getString(2)==null?"":cursor.getString(2)).put("accountName",cursor.getString(3)==null?"":cursor.getString(3)).put("accountType",cursor.getString(4)==null?"":cursor.getString(4)).put("ownerAccount",cursor.getString(5)==null?"":cursor.getString(5)).put("visible",cursor.getInt(6)!=0).put("syncEvents",cursor.getInt(7)!=0).put("accessLevel",accessLevel).put("editable",editable).put("primary",cursor.getInt(9)!=0);calendars.put(item);if(editable)editableCalendars.put(item);}
        }
        return new JSONObject().put("events",values).put("calendars",calendars).put("editableCalendars",editableCalendars);
    }
    private static JSONObject createCalendar(Context context,JSONObject p)throws Exception{
        require(context,Manifest.permission.WRITE_CALENDAR);long calendarId=p.getLong("calendarId"),begin=p.getLong("begin"),end=p.optLong("end",begin+3600000);ContentValues values=new ContentValues();values.put(CalendarContract.Events.CALENDAR_ID,calendarId);values.put(CalendarContract.Events.TITLE,p.getString("title"));values.put(CalendarContract.Events.DTSTART,begin);values.put(CalendarContract.Events.DTEND,end);values.put(CalendarContract.Events.EVENT_TIMEZONE,TimeZone.getDefault().getID());
        Uri uri=context.getContentResolver().insert(CalendarContract.Events.CONTENT_URI,values);if(uri==null)throw new IOException("Android no pudo crear el evento");return new JSONObject().put("uri",uri.toString());
    }
    private static JSONObject updateCalendar(Context context,JSONObject p)throws Exception{
        require(context,Manifest.permission.WRITE_CALENDAR);long id=p.getLong("id");ContentValues values=new ContentValues();if(p.has("title"))values.put(CalendarContract.Events.TITLE,p.getString("title"));if(p.has("begin"))values.put(CalendarContract.Events.DTSTART,p.getLong("begin"));if(p.has("end"))values.put(CalendarContract.Events.DTEND,p.getLong("end"));if(p.has("location"))values.put(CalendarContract.Events.EVENT_LOCATION,p.getString("location"));
        int changed=context.getContentResolver().update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,id),values,null,null);if(changed==0)throw new IOException("Evento no encontrado o no editable");return new JSONObject().put("updated",changed);
    }
    private static JSONObject deleteCalendar(Context context,JSONObject p)throws Exception{
        require(context,Manifest.permission.WRITE_CALENDAR);int changed=context.getContentResolver().delete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,p.getLong("id")),null,null);if(changed==0)throw new IOException("Evento no encontrado o no editable");return new JSONObject().put("deleted",changed);
    }
    private static JSONObject location(Context context)throws Exception{
        require(context,Manifest.permission.ACCESS_FINE_LOCATION);LocationManager manager=context.getSystemService(LocationManager.class);if(manager==null)throw new UnsupportedOperationException("unsupported: este dispositivo no ofrece ubicación");Location best=null;
        for(String provider:manager.getProviders(true))try{Location next=manager.getLastKnownLocation(provider);if(next!=null&&(best==null||next.getTime()>best.getTime()))best=next;}catch(SecurityException ignored){}
        if(best==null)throw new IOException("Todavía no hay una ubicación disponible");return new JSONObject().put("latitude",best.getLatitude()).put("longitude",best.getLongitude()).put("accuracy",best.getAccuracy()).put("time",best.getTime());
    }
    private static JSONObject showNotification(Context context,JSONObject p)throws Exception{
        if(Build.VERSION.SDK_INT>=33)require(context,Manifest.permission.POST_NOTIFICATIONS);android.app.NotificationManager manager=context.getSystemService(android.app.NotificationManager.class);String channel="atlas-messages";
        manager.createNotificationChannel(new android.app.NotificationChannel(channel,"Mensajes de ATLAS",android.app.NotificationManager.IMPORTANCE_DEFAULT));
        int id=Math.abs(p.optInt("id",(int)System.currentTimeMillis()));manager.notify(id,new android.app.Notification.Builder(context,channel).setSmallIcon(R.drawable.ic_stat_atlas).setContentTitle(p.optString("title","ATLAS")).setContentText(p.optString("text")).setAutoCancel(true).build());return new JSONObject().put("shown",true).put("id",id);
    }
    private static JSONObject openWifiPanel(Context context)throws Exception{
        return requestUserAction(context,new Intent(android.provider.Settings.Panel.ACTION_WIFI),"ATLAS necesita que elijas una red","Toca para abrir el panel Wi-Fi",94);
    }
    private static JSONObject files(JSONObject p)throws Exception{
        File target=resolveSharedPath(p.optString("path",""),true);
        File[] list=target.listFiles();JSONArray values=new JSONArray();if(list!=null){Arrays.sort(list,Comparator.comparing(File::getName,String.CASE_INSENSITIVE_ORDER));for(File file:list){values.put(new JSONObject().put("name",file.getName()).put("path",file.getPath()).put("directory",file.isDirectory()).put("size",file.isFile()?file.length():0).put("modified",file.lastModified()));if(values.length()>=200)break;}}
        return new JSONObject().put("path",target.getPath()).put("files",values);
    }
    private static File sharedPath(JSONObject p,String key,boolean allowRoot)throws Exception{
        return resolveSharedPath(p.getString(key),allowRoot);
    }
    private static File resolveSharedPath(String raw,boolean allowRoot)throws Exception{
        if(!Environment.isExternalStorageManager())throw new SecurityException("permission_required: MANAGE_EXTERNAL_STORAGE");
        File root=Environment.getExternalStorageDirectory().getCanonicalFile();
        File candidate=raw.isEmpty()?root:new File(raw);
        File target=(candidate.isAbsolute()?candidate:new File(root,raw)).getCanonicalFile();
        Path rootPath=root.toPath(),targetPath=target.toPath();
        if(!targetPath.startsWith(rootPath)||(!allowRoot&&targetPath.equals(rootPath)))throw new SecurityException("Ruta fuera del almacenamiento compartido");
        Path androidData=rootPath.resolve("Android").resolve("data");
        if(targetPath.startsWith(androidData))throw new UnsupportedOperationException("unsupported: Android no permite acceder a Android/data de otras aplicaciones ni siquiera con acceso completo");
        return target;
    }
    private static JSONObject readFile(JSONObject p)throws Exception{
        File file=sharedPath(p,"path",false);if(!file.isFile())throw new IOException("El archivo no existe");long maximum=Math.max(1024,Math.min(1024L*1024,p.optLong("maxBytes",512L*1024)));if(file.length()>maximum)throw new IOException("Archivo demasiado grande para el canal seguro; máximo "+maximum+" bytes");byte[] bytes=Files.readAllBytes(file.toPath());
        return new JSONObject().put("path",file.getPath()).put("mime",Optional.ofNullable(java.net.URLConnection.guessContentTypeFromName(file.getName())).orElse("application/octet-stream")).put("data",android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP)).put("bytes",bytes.length);
    }
    private static JSONObject moveFile(JSONObject p)throws Exception{
        File source=sharedPath(p,"source",false),target=sharedPath(p,"destination",false);if(!source.exists())throw new IOException("El origen no existe");if(target.exists()&&!p.optBoolean("replace",false))throw new IOException("El destino ya existe");Path moved=Files.move(source.toPath(),target.toPath(),p.optBoolean("replace",false)?new StandardCopyOption[]{StandardCopyOption.REPLACE_EXISTING}:new StandardCopyOption[0]);return new JSONObject().put("moved",true).put("path",moved.toString());
    }
    private static JSONObject deleteFile(JSONObject p)throws Exception{
        File target=sharedPath(p,"path",false);if(!target.exists())throw new IOException("El archivo no existe");if(target.isDirectory()&&!p.optBoolean("recursive",false)&&Objects.requireNonNullElse(target.list(),new String[0]).length>0)throw new IOException("La carpeta no está vacía; indica recursive=true");boolean deleted=deleteTree(target,p.optBoolean("recursive",false));if(!deleted)throw new IOException("Android no pudo eliminar el archivo");return new JSONObject().put("deleted",true);
    }
    private static boolean deleteTree(File target,boolean recursive){if(target.isDirectory()&&recursive){File[] children=target.listFiles();if(children!=null)for(File child:children)if(!deleteTree(child,true))return false;}return target.delete();}
    private static JSONObject media(Context context,JSONObject p)throws Exception{
        if(Build.VERSION.SDK_INT>=33)require(context,Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VIDEO,Manifest.permission.READ_MEDIA_AUDIO);else require(context,Manifest.permission.READ_EXTERNAL_STORAGE);
        JSONArray values=new JSONArray();Uri uri=MediaStore.Files.getContentUri("external");String[] columns={MediaStore.Files.FileColumns._ID,MediaStore.Files.FileColumns.DISPLAY_NAME,MediaStore.Files.FileColumns.MIME_TYPE,MediaStore.Files.FileColumns.SIZE,MediaStore.Files.FileColumns.DATE_MODIFIED};
        try(Cursor cursor=context.getContentResolver().query(uri,columns,null,null,MediaStore.Files.FileColumns.DATE_MODIFIED+" DESC")){if(cursor!=null)while(cursor.moveToNext()&&values.length()<Math.max(1,Math.min(100,p.optInt("limit",30))))values.put(new JSONObject().put("uri",ContentUris.withAppendedId(uri,cursor.getLong(0)).toString()).put("name",cursor.getString(1)).put("mime",cursor.getString(2)).put("size",cursor.getLong(3)).put("modified",cursor.getLong(4)*1000));}
        return new JSONObject().put("media",values);
    }
    private static JSONObject deleteMedia(Context context,JSONObject p)throws Exception{
        ArrayList<Uri> uris=new ArrayList<>();if(p.has("uri"))uris.add(Uri.parse(p.getString("uri")));JSONArray list=p.optJSONArray("uris");if(list!=null)for(int i=0;i<list.length();i++)uris.add(Uri.parse(list.getString(i)));if(uris.isEmpty())throw new IllegalArgumentException("Falta uri o uris");for(Uri uri:uris)if(!"content".equals(uri.getScheme())||!"media".equals(uri.getAuthority()))throw new SecurityException("URI multimedia no válida");
        int deleted=0;try{for(Uri uri:uris)deleted+=context.getContentResolver().delete(uri,null,null);return new JSONObject().put("deleted",deleted);}
        catch(SecurityException denied){
            if(Build.VERSION.SDK_INT<30)throw new SecurityException("requires_user_action: Android debe confirmar la eliminación");if(Build.VERSION.SDK_INT>=33)require(context,Manifest.permission.POST_NOTIFICATIONS);android.app.PendingIntent consent=MediaStore.createDeleteRequest(context.getContentResolver(),uris);android.app.NotificationManager manager=context.getSystemService(android.app.NotificationManager.class);String channel="atlas-consent";manager.createNotificationChannel(new android.app.NotificationChannel(channel,"Confirmaciones de ATLAS",android.app.NotificationManager.IMPORTANCE_HIGH));
            manager.notify(92,new android.app.Notification.Builder(context,channel).setSmallIcon(R.drawable.ic_stat_atlas).setContentTitle("ATLAS necesita tu confirmación").setContentText("Toca para confirmar la eliminación de contenido multimedia").setAutoCancel(true).setContentIntent(consent).build());return new JSONObject().put("requires_user_action",true).put("notification",true);
        }
    }
    private static JSONObject camera(Context context,boolean video)throws Exception{
        Intent intent=new Intent(video?MediaStore.INTENT_ACTION_VIDEO_CAMERA:MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);if(intent.resolveActivity(context.getPackageManager())==null)throw new UnsupportedOperationException("unsupported: no hay una aplicación de cámara disponible");JSONObject result=requestUserAction(context,intent,"ATLAS ha preparado la cámara",video?"Toca para grabar el vídeo":"Toca para tomar la foto",video?96:95);result.put("mode",video?"video":"photo");return result;
    }
    private static JSONObject requestUserAction(Context context,Intent intent,String title,String text,int id)throws Exception{
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);if(context instanceof android.app.Activity){context.startActivity(intent);return new JSONObject().put("requires_user_action",true).put("opened",true);}
        if(Build.VERSION.SDK_INT>=33)require(context,Manifest.permission.POST_NOTIFICATIONS);android.app.PendingIntent pending=android.app.PendingIntent.getActivity(context,id,intent,android.app.PendingIntent.FLAG_UPDATE_CURRENT|android.app.PendingIntent.FLAG_IMMUTABLE);android.app.NotificationManager manager=context.getSystemService(android.app.NotificationManager.class);String channel="atlas-consent";manager.createNotificationChannel(new android.app.NotificationChannel(channel,"Confirmaciones de ATLAS",android.app.NotificationManager.IMPORTANCE_HIGH));manager.notify(id,new android.app.Notification.Builder(context,channel).setSmallIcon(R.drawable.ic_stat_atlas).setContentTitle(title).setContentText(text).setAutoCancel(true).setContentIntent(pending).build());return new JSONObject().put("requires_user_action",true).put("notification",true);
    }
    private static JSONObject sensors(Context context)throws Exception{
        SensorManager manager=context.getSystemService(SensorManager.class);if(manager==null)throw new UnsupportedOperationException("unsupported: este dispositivo no ofrece sensores");JSONArray available=new JSONArray();for(Sensor sensor:manager.getSensorList(Sensor.TYPE_ALL))available.put(new JSONObject().put("name",sensor.getName()).put("type",sensor.getType()));JSONArray samples=new JSONArray();HandlerThread thread=new HandlerThread("atlas-sensors");thread.start();CountDownLatch latch=new CountDownLatch(1);Set<Integer> wanted=new HashSet<>(Arrays.asList(Sensor.TYPE_ACCELEROMETER,Sensor.TYPE_GYROSCOPE,Sensor.TYPE_LIGHT,Sensor.TYPE_PROXIMITY,Sensor.TYPE_STEP_COUNTER));Set<Integer> seen=ConcurrentHashMap.newKeySet();
        SensorEventListener listener=new SensorEventListener(){public void onAccuracyChanged(Sensor sensor,int accuracy){}public void onSensorChanged(SensorEvent event){if(!wanted.contains(event.sensor.getType())||!seen.add(event.sensor.getType()))return;try{JSONArray values=new JSONArray();for(float value:event.values)values.put(value);samples.put(new JSONObject().put("name",event.sensor.getName()).put("type",event.sensor.getType()).put("values",values).put("timestampNanos",event.timestamp));}catch(Exception ignored){}if(seen.size()>=wanted.size())latch.countDown();}};
        for(int type:wanted){Sensor sensor=manager.getDefaultSensor(type);if(sensor!=null)try{manager.registerListener(listener,sensor,SensorManager.SENSOR_DELAY_NORMAL,new Handler(thread.getLooper()));}catch(SecurityException ignored){}}
        latch.await(1200,TimeUnit.MILLISECONDS);manager.unregisterListener(listener);thread.quitSafely();return new JSONObject().put("available",available).put("samples",samples);
    }
    private static JSONObject ok()throws JSONException{return new JSONObject().put("ok",true);}
}
