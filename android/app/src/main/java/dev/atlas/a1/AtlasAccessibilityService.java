package dev.atlas.a1;

import android.accessibilityservice.*;
import android.app.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.hardware.HardwareBuffer;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.util.*;
import android.view.*;
import android.view.accessibility.*;
import android.widget.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Explicitly enabled, locally paired UI-control surface for this private sideload. */
public final class AtlasAccessibilityService extends AccessibilityService {
    private static volatile AtlasAccessibilityService instance;
    private static final int CONTROL_NOTIFICATION=83;
    private static final String CHANNEL="atlas-control";
    private static final long GESTURE_OVERLAY_SETTLE_MS=80;
    private static final long SCREENSHOT_RETRY_DELAY_MS=350;
    private static final int SCREENSHOT_MAX_ATTEMPTS=2;
    private static final int SCREENSHOT_MAX_WIDTH=640;
    private static final int SCREENSHOT_JPEG_QUALITY=82;
    private static final int SCREENSHOT_MAX_BYTES=600_000;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService captureWorker=Executors.newSingleThreadExecutor();
    private WindowManager windows;
    private FrameLayout guard;
    private WindowManager.LayoutParams guardParams;
    private volatile boolean controlling;
    private final Runnable idleStop=this::stopControl;

    static boolean enabled(Context context){
        String value=Settings.Secure.getString(context.getContentResolver(),Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        ComponentName component=new ComponentName(context,AtlasAccessibilityService.class);
        return value!=null&&(Arrays.asList(value.split(":" )).contains(component.flattenToString())||Arrays.asList(value.split(":" )).contains(component.flattenToShortString()));
    }
    static boolean controlling(){AtlasAccessibilityService service=instance;return service!=null&&service.controlling;}
    static void stopControlIfRunning(){AtlasAccessibilityService service=instance;if(service!=null)service.stopControl();}
    static JSONObject execute(JSONObject request)throws Exception{
        AtlasAccessibilityService service=instance;
        if(service==null){
            if("status".equals(request.optString("action")))return new JSONObject().put("enabled",false).put("controlling",false);
            throw new SecurityException("permission_required: ACCESSIBILITY_SERVICE");
        }
        return service.perform(request.optString("action"),request);
    }

    @Override protected void onServiceConnected(){instance=this;windows=getSystemService(WindowManager.class);}
    @Override public void onAccessibilityEvent(AccessibilityEvent event){}
    @Override public void onInterrupt(){stopControl();}
    @Override public boolean onUnbind(Intent intent){stopControl();instance=null;return super.onUnbind(intent);}
    @Override public void onDestroy(){stopControl();captureWorker.shutdownNow();instance=null;super.onDestroy();}

    private <T> T onMain(Callable<T> work)throws Exception{
        if(Looper.myLooper()==Looper.getMainLooper())return work.call();
        CompletableFuture<T> result=new CompletableFuture<>();
        main.post(()->{try{result.complete(work.call());}catch(Exception e){result.completeExceptionally(e);}});
        return result.get(8,TimeUnit.SECONDS);
    }
    private JSONObject perform(String action,JSONObject p)throws Exception{
        if("start".equals(action)){startControl();return ok();}
        if("stop".equals(action)){stopControl();return ok();}
        if("status".equals(action))return new JSONObject().put("enabled",true).put("controlling",controlling);
        if(!controlling)throw new IOException("Inicia primero una sesión con atlas-androiduse start");
        touchSession();
        switch(action){
            case "screenshot": return screenshot();
            case "tree": return onMain(this::tree);
            case "click": return onMain(()->clickLabel(p));
            case "tap": return gesture(point(p,"x"),point(p,"y"),point(p,"x"),point(p,"y"),80);
            case "long_press": return gesture(point(p,"x"),point(p,"y"),point(p,"x"),point(p,"y"),Math.max(550,p.optLong("duration",700)));
            case "swipe": return gesture(point(p,"x1"),point(p,"y1"),point(p,"x2"),point(p,"y2"),Math.max(120,Math.min(1800,p.optLong("duration",360))));
            case "text": return onMain(()->setText(p.optString("text")));
            case "back": return global(GLOBAL_ACTION_BACK);
            case "home": return global(GLOBAL_ACTION_HOME);
            case "recents": return global(GLOBAL_ACTION_RECENTS);
            case "key": {
                String key=p.optString("key").toLowerCase(Locale.ROOT);
                if("back".equals(key))return global(GLOBAL_ACTION_BACK);if("home".equals(key))return global(GLOBAL_ACTION_HOME);if("recents".equals(key))return global(GLOBAL_ACTION_RECENTS);
                if("enter".equals(key))return imeEnter();
                throw new UnsupportedOperationException("unsupported: Accessibility solo admite ENTER o back/home/recents; usa text para escribir");
            }
            case "launch": return onMain(()->launch(p));
            case "wait": Thread.sleep(Math.max(0,Math.min(2500,p.optLong("ms",350))));return ok();
            default: throw new SecurityException("Acción Android Use no permitida: "+action);
        }
    }
    private float point(JSONObject p,String key){
        double value=p.optDouble(key,0);DisplayMetrics metrics=getResources().getDisplayMetrics();
        if(value>=0&&value<=1)value*=key.startsWith("x")?metrics.widthPixels:metrics.heightPixels;
        return (float)value;
    }
    private JSONObject gesture(float x1,float y1,float x2,float y2,long duration)throws Exception{
        CompletableFuture<Boolean> result=new CompletableFuture<>();
        onMain(()->{
            setGuardPassThrough(true);
            // WindowManager needs one rendered frame to publish FLAG_NOT_TOUCHABLE
            // to InputDispatcher; dispatching in the same callback can hit our own
            // safety overlay instead of the application below it.
            main.postDelayed(()->{
                if(result.isDone()){setGuardPassThrough(false);return;}
                try{
                    Path path=new Path();path.moveTo(x1,y1);if(x1!=x2||y1!=y2)path.lineTo(x2,y2);
                    GestureDescription gesture=new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(path,0,duration)).build();
                    if(!dispatchGesture(gesture,new GestureResultCallback(){
                        @Override public void onCompleted(GestureDescription d){setGuardPassThrough(false);result.complete(true);}
                        @Override public void onCancelled(GestureDescription d){setGuardPassThrough(false);result.complete(false);}
                    },null)){setGuardPassThrough(false);result.complete(false);}
                }catch(Exception error){setGuardPassThrough(false);result.completeExceptionally(error);}
            },GESTURE_OVERLAY_SETTLE_MS);
            return null;
        });
        try{if(!result.get(4,TimeUnit.SECONDS))throw new IOException("Android rechazó el gesto");return new JSONObject().put("dispatched",true);}
        finally{onMain(()->{setGuardPassThrough(false);return null;});}
    }
    private JSONObject global(int action)throws Exception{return onMain(()->new JSONObject().put("performed",performGlobalAction(action)));}
    private JSONObject imeEnter()throws Exception{
        return onMain(()->{
            AccessibilityNodeInfo root=getRootInActiveWindow();if(root==null)throw new IOException("No hay una ventana activa");
            AccessibilityNodeInfo target=root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);if(target==null)target=findEditable(root);
            if(target==null){root.recycle();throw new IOException("No hay un campo de texto activo");}
            boolean performed;
            try{performed=target.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());}
            finally{target.recycle();root.recycle();}
            if(!performed)throw new UnsupportedOperationException("unsupported: el campo activo no ofrece una acción ENTER segura");
            return new JSONObject().put("performed",true).put("action","ime_enter");
        });
    }
    private JSONObject setText(String text)throws Exception{
        AccessibilityNodeInfo root=getRootInActiveWindow();if(root==null)throw new IOException("No hay una ventana activa");
        AccessibilityNodeInfo target=root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);if(target==null)target=findEditable(root);
        if(target==null){root.recycle();throw new IOException("No hay un campo de texto activo");}
        Bundle args=new Bundle();args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,text);
        boolean changed=target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,args);target.recycle();root.recycle();
        if(!changed)throw new IOException("La aplicación no permite introducir texto en ese campo");return ok();
    }
    private AccessibilityNodeInfo findEditable(AccessibilityNodeInfo node){
        if(node==null)return null;if(node.isEditable())return AccessibilityNodeInfo.obtain(node);
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i),found=findEditable(child);if(child!=null)child.recycle();if(found!=null)return found;}return null;
    }
    private String normalizedLabel(CharSequence value){return java.text.Normalizer.normalize(value==null?"":value.toString(),java.text.Normalizer.Form.NFD).replaceAll("\\p{M}+","").toLowerCase(Locale.ROOT).replaceAll("\\s+"," ").trim();}
    private AccessibilityNodeInfo findLabel(AccessibilityNodeInfo node,String query,boolean exact){
        if(node==null)return null;String text=normalizedLabel(node.getText()),description=normalizedLabel(node.getContentDescription());
        if((exact&&(query.equals(text)||query.equals(description)))||(!exact&&(!text.isEmpty()&&text.contains(query)||!description.isEmpty()&&description.contains(query))))return AccessibilityNodeInfo.obtain(node);
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i),found=findLabel(child,query,exact);if(child!=null)child.recycle();if(found!=null)return found;}return null;
    }
    private JSONObject clickLabel(JSONObject p)throws Exception{
        String requested=p.optString("text",p.optString("description",p.optString("query",""))).trim();if(requested.isEmpty())throw new IllegalArgumentException("Falta text, description o query");
        String query=normalizedLabel(requested);AccessibilityNodeInfo root=getRootInActiveWindow();if(root==null)throw new IOException("No hay una ventana activa");
        AccessibilityNodeInfo target=findLabel(root,query,p.optBoolean("exact",true));root.recycle();if(target==null)throw new IOException("No se encontró el control: "+requested);
        Rect bounds=new Rect();target.getBoundsInScreen(bounds);AccessibilityNodeInfo clickable=target;
        while(clickable!=null&&!clickable.isClickable()){AccessibilityNodeInfo parent=clickable.getParent();clickable.recycle();clickable=parent;}
        if(clickable==null)throw new IOException("El control no admite pulsación: "+requested);
        boolean performed;try{performed=clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK);}finally{clickable.recycle();}
        if(!performed)throw new IOException("Android rechazó la pulsación sobre: "+requested);
        return new JSONObject().put("clicked",true).put("matched",requested).put("bounds",new JSONArray(Arrays.asList(bounds.left,bounds.top,bounds.right,bounds.bottom)));
    }
    private JSONObject launch(JSONObject p)throws Exception{
        Intent intent;String packageName=p.optString("package").trim(),uri=p.optString("uri").trim();
        if(!packageName.isEmpty()){
            if(!packageName.matches("[A-Za-z0-9_.]{3,160}"))throw new SecurityException("Paquete no válido");
            if(Build.VERSION.SDK_INT>=33){
                try{getPackageManager().getLaunchIntentSenderForPackage(packageName).sendIntent(this,0,null,null,null);return ok();}
                catch(IntentSender.SendIntentException|IllegalArgumentException error){throw new IOException("Aplicación no instalada",error);}
            }
            intent=getPackageManager().getLaunchIntentForPackage(packageName);if(intent==null)throw new IOException("Aplicación no instalada");
        }
        else {Uri target=Uri.parse(uri);if(!Arrays.asList("https","http","geo","tel","sms","mailto").contains(target.getScheme()))throw new SecurityException("Enlace no permitido");intent=new Intent(Intent.ACTION_VIEW,target);}
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(intent);return ok();
    }
    private JSONObject tree()throws Exception{
        AccessibilityNodeInfo root=getRootInActiveWindow();JSONArray nodes=new JSONArray();if(root!=null){appendNode(root,nodes,0,new int[]{0},false);root.recycle();}return new JSONObject().put("nodes",nodes);
    }
    private void appendNode(AccessibilityNodeInfo node,JSONArray out,int depth,int[] count,boolean inheritedPassword)throws Exception{
        if(node==null||depth>12||count[0]++>=220)return;Rect bounds=new Rect();node.getBoundsInScreen(bounds);
        boolean password=inheritedPassword||node.isPassword();String redacted="[REDACTED]";
        out.put(new JSONObject().put("class",String.valueOf(node.getClassName())).put("text",password?redacted:String.valueOf(node.getText()==null?"":node.getText()))
            .put("description",password?redacted:String.valueOf(node.getContentDescription()==null?"":node.getContentDescription())).put("password",password).put("clickable",node.isClickable()).put("editable",node.isEditable())
            .put("bounds",new JSONArray(Arrays.asList(bounds.left,bounds.top,bounds.right,bounds.bottom))));
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null){appendNode(child,out,depth+1,count,password);child.recycle();}}
    }
    private JSONObject screenshot()throws Exception{
        CompletableFuture<JSONObject> result=new CompletableFuture<>();onMain(()->{if(guard!=null)guard.setVisibility(View.INVISIBLE);return null;});
        requestScreenshot(result,0);
        try{return result.get(6,TimeUnit.SECONDS);}
        finally{result.cancel(false);onMain(()->{if(guard!=null&&controlling)guard.setVisibility(View.VISIBLE);return null;});}
    }
    private void requestScreenshot(CompletableFuture<JSONObject> result,int attempt){
        long delay=attempt==0?80:SCREENSHOT_RETRY_DELAY_MS;
        main.postDelayed(()->{
            if(result.isDone())return;
            try{takeScreenshot(Display.DEFAULT_DISPLAY,captureWorker,new TakeScreenshotCallback(){
            @Override public void onSuccess(ScreenshotResult shot){
                try(HardwareBuffer buffer=shot.getHardwareBuffer()){
                    Bitmap hardware=Bitmap.wrapHardwareBuffer(buffer,shot.getColorSpace());if(hardware==null)throw new IOException("Android no entregó la captura");
                    Bitmap bitmap=hardware.copy(Bitmap.Config.ARGB_8888,false);int originalWidth=bitmap.getWidth(),originalHeight=bitmap.getHeight();
                    if(bitmap.getWidth()>SCREENSHOT_MAX_WIDTH){Bitmap scaled=Bitmap.createScaledBitmap(bitmap,SCREENSHOT_MAX_WIDTH,Math.round(bitmap.getHeight()*(SCREENSHOT_MAX_WIDTH/(float)bitmap.getWidth())),true);bitmap.recycle();bitmap=scaled;}
                    byte[] encoded;int deliveredWidth,deliveredHeight;
                    while(true){
                        ByteArrayOutputStream bytes=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,SCREENSHOT_JPEG_QUALITY,bytes);encoded=bytes.toByteArray();
                        deliveredWidth=bitmap.getWidth();deliveredHeight=bitmap.getHeight();
                        if(encoded.length<=SCREENSHOT_MAX_BYTES||bitmap.getWidth()<=320)break;
                        int width=Math.max(320,Math.round(bitmap.getWidth()*.78f));Bitmap scaled=Bitmap.createScaledBitmap(bitmap,width,Math.round(bitmap.getHeight()*(width/(float)bitmap.getWidth())),true);bitmap.recycle();bitmap=scaled;
                    }
                    bitmap.recycle();
                    result.complete(new JSONObject().put("mime","image/jpeg").put("width",originalWidth).put("height",originalHeight).put("captureWidth",deliveredWidth).put("captureHeight",deliveredHeight).put("bytes",encoded.length).put("data",android.util.Base64.encodeToString(encoded,android.util.Base64.NO_WRAP)));
                }catch(Exception e){result.completeExceptionally(e);}
            }
            @Override public void onFailure(int code){
                if(code==ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT&&attempt+1<SCREENSHOT_MAX_ATTEMPTS){requestScreenshot(result,attempt+1);return;}
                result.completeExceptionally(new IOException("No se pudo capturar la pantalla ("+code+")"));
            }
            });}catch(Exception error){result.completeExceptionally(error);}
        },delay);
    }
    private void startControl()throws Exception{onMain(()->{if(!controlling){controlling=true;showGuard();showNotification();}touchSession();return null;});}
    private void touchSession(){main.removeCallbacks(idleStop);main.postDelayed(idleStop,600_000);}
    private void stopControl(){main.post(()->{main.removeCallbacks(idleStop);controlling=false;if(guard!=null){try{windows.removeView(guard);}catch(Exception ignored){}guard=null;guardParams=null;}getSystemService(NotificationManager.class).cancel(CONTROL_NOTIFICATION);});}
    private void setGuardPassThrough(boolean passThrough){
        if(guard==null||guardParams==null||windows==null)return;
        guard.setVisibility(passThrough?View.INVISIBLE:controlling?View.VISIBLE:View.GONE);
        int next=passThrough?guardParams.flags|WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE:guardParams.flags&~WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        if(next==guardParams.flags)return;guardParams.flags=next;
        try{windows.updateViewLayout(guard,guardParams);}catch(Exception ignored){}
    }
    private void showNotification(){
        NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Control del teléfono",NotificationManager.IMPORTANCE_LOW));
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        manager.notify(CONTROL_NOTIFICATION,new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_stat_atlas).setContentTitle("ATLAS está controlando este teléfono.")
            .setContentText("Abre ATLAS para detener el control").setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE).setContentIntent(open).build());
    }
    private void showGuard(){
        guard=new FrameLayout(this);guard.setBackgroundColor(Color.TRANSPARENT);guard.setOnTouchListener((v,e)->true);guard.addView(new AuraView(this),new FrameLayout.LayoutParams(-1,-1));
        Button stop=new Button(this);stop.setText("ATLAS está controlando el teléfono. Presiona aquí para pararlo");stop.setTextColor(Color.WHITE);stop.setTextSize(13);stop.setAllCaps(false);stop.setPadding(26,0,26,0);
        GradientDrawable background=new GradientDrawable();background.setColor(0xffe13b48);background.setCornerRadius(dp(28));stop.setBackground(background);stop.setOnClickListener(v->stopControl());
        FrameLayout.LayoutParams button=new FrameLayout.LayoutParams(-1,dp(58),Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL);button.setMargins(dp(32),0,dp(32),dp(42));guard.addView(stop,button);
        guardParams=new WindowManager.LayoutParams(-1,-1,WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN|WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,PixelFormat.TRANSLUCENT);guardParams.gravity=Gravity.TOP|Gravity.START;windows.addView(guard,guardParams);
    }
    private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private JSONObject ok()throws JSONException{return new JSONObject().put("ok",true);}

    private static final class AuraView extends View {
        private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        AuraView(Context context){super(context);setLayerType(View.LAYER_TYPE_SOFTWARE,null);paint.setStyle(Paint.Style.STROKE);paint.setMaskFilter(new BlurMaskFilter(22,BlurMaskFilter.Blur.NORMAL));}
        @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);for(int i=0;i<4;i++){paint.setStrokeWidth(7+i*8);paint.setColor(Color.argb(115-i*22,20,143,255));float inset=3+i*4;canvas.drawRoundRect(inset,inset,getWidth()-inset,getHeight()-inset,28,28,paint);}}
    }
}
