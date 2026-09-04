package dev.atlas.a1;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.os.ParcelUuid;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;

@SuppressLint("MissingPermission") // Every entry point checks runtime grants; callbacks can race revocation and catch SecurityException.
final class BlePairingManager {
    static final UUID SERVICE=UUID.fromString("7d2f8c42-7b5d-4a8d-9f20-61746c617331");
    static final UUID CHARACTERISTIC=UUID.fromString("7d2f8c43-7b5d-4a8d-9f20-61746c617331");
    interface Events {void state(String state,String message);void found(String name);void success(String payload);void error(String message);}
    private final Activity activity;
    private final Events events;
    private final BluetoothAdapter adapter;
    private final Handler main=new Handler(Looper.getMainLooper());
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private BluetoothDevice device;
    private volatile BluetoothGatt gatt;
    private volatile boolean reported;
    private volatile int generation;
    private volatile Runnable timeout;

    BlePairingManager(Activity activity,Events events){
        this.activity=activity;this.events=events;
        BluetoothManager manager=activity.getSystemService(BluetoothManager.class);
        adapter=manager==null?null:manager.getAdapter();
    }
    boolean permitted(){return Build.VERSION.SDK_INT<31||
        activity.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED&&
        activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;}
    void scan(){
        stop();reported=false;device=null;final int token=generation;
        if(adapter==null){events.error("Este teléfono no dispone de Bluetooth");return;}
        if(!permitted()){events.error("Permite Bluetooth para buscar ATLAS A1");return;}
        if(!adapter.isEnabled()){events.error("Activa Bluetooth para buscar ATLAS A1");return;}
        try{
            scanner=adapter.getBluetoothLeScanner();
            if(scanner==null){events.error("Bluetooth no está preparado todavía");return;}
            ScanFilter filter=new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build();
            scanCallback=new ScanCallback(){
                @Override public void onScanResult(int type,ScanResult result){
                    if(token!=generation||device!=null)return;device=result.getDevice();stopScan();cancelTimeout();
                    String name="ATLAS A1";try{if(device.getName()!=null)name=device.getName();}catch(SecurityException ignored){}
                    events.state("detected","ATLAS A1 detectado");events.found(name);
                }
                @Override public void onScanFailed(int code){
                    if(token!=generation)return;stopScan();cancelTimeout();events.state("error","No se pudo buscar ATLAS A1");events.error("No se pudo iniciar el escaneo Bluetooth ("+code+")");
                }
            };
            scanner.startScan(Collections.singletonList(filter),new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),scanCallback);
            events.state("scanning","Buscando ATLAS A1…");
            timeout=()->{if(token==generation&&device==null&&scanner!=null){stopScan();events.state("not-found","ATLAS A1 no encontrado");events.error("No se encontró ningún ATLAS A1. Ejecuta atlas-app pair en la Pi.");}};
            main.postDelayed(timeout,15000);
        }catch(SecurityException e){stopScan();events.state("error","Android bloqueó el escaneo Bluetooth");events.error("Android bloqueó el escaneo Bluetooth");}
    }
    void submit(String code){
        if(device==null){events.error("Primero espera a que aparezca ATLAS A1");return;}
        String digits=code==null?"":code.replaceAll("\\D","");
        if(!digits.matches("\\d{6}")){events.error("Introduce los seis dígitos");return;}
        stopScan();cancelTimeout();final int token=++generation;closeGatt();reported=false;
        events.state("connecting","Conectando con ATLAS A1…");
        try{
            gatt=device.connectGatt(activity,false,new PairGatt(digits,token),BluetoothDevice.TRANSPORT_LE);
            timeout=()->{if(token==generation&&!reported){reported=true;events.state("error","ATLAS A1 no respondió");events.error("ATLAS A1 tardó demasiado en responder");closeGatt();}};
            main.postDelayed(timeout,20000);
        }catch(SecurityException e){events.state("error","Falta permiso para conectar por Bluetooth");events.error("Falta permiso para conectar por Bluetooth");}
    }
    private void cancelTimeout(){if(timeout!=null)main.removeCallbacks(timeout);timeout=null;}
    private void stopScan(){try{if(scanner!=null&&scanCallback!=null)scanner.stopScan(scanCallback);}catch(Exception ignored){}scanner=null;scanCallback=null;}
    private void closeGatt(){closeGatt(null);}
    private void closeGatt(BluetoothGatt target){
        BluetoothGatt current;
        synchronized(this){current=target==null?gatt:target;if(current==gatt)gatt=null;}
        if(current!=null)try{current.disconnect();current.close();}catch(Exception ignored){}
    }
    void stop(){generation++;reported=true;cancelTimeout();stopScan();closeGatt();}
    private final class PairGatt extends BluetoothGattCallback {
        private final String code;
        private final int token;
        PairGatt(String code,int token){this.code=code;this.token=token;}
        private void fail(BluetoothGatt g,String message){if(reported||token!=generation)return;reported=true;cancelTimeout();events.state("error",message);events.error(message);closeGatt(g);}
        private void deliver(BluetoothGatt g,byte[] value){
            if(reported||token!=generation)return;String payload=new String(value,StandardCharsets.UTF_8);
            if(!payload.startsWith("atlas1:")){fail(g,"ATLAS A1 rechazó el código");return;}
            reported=true;cancelTimeout();events.state("paired","ATLAS A1 emparejado correctamente");events.success(payload);closeGatt(g);
        }
        @Override public void onConnectionStateChange(BluetoothGatt g,int status,int state){
            if(status!=BluetoothGatt.GATT_SUCCESS){fail(g,"No se pudo conectar con ATLAS A1");return;}
            try{if(state==BluetoothProfile.STATE_CONNECTED){events.state("authorizing","Conexión segura establecida…");if(!g.requestMtu(512)&&!g.discoverServices())fail(g,"No se pudieron descubrir los servicios de ATLAS A1");}else if(state==BluetoothProfile.STATE_DISCONNECTED&&!reported)fail(g,"ATLAS A1 se desconectó");}catch(SecurityException e){fail(g,"Android bloqueó la conexión Bluetooth");}
        }
        @Override public void onMtuChanged(BluetoothGatt g,int mtu,int status){try{if(!g.discoverServices())fail(g,"No se pudieron descubrir los servicios de ATLAS A1");}catch(SecurityException e){fail(g,"No se pudieron descubrir los servicios de ATLAS A1");}}
        @Override public void onServicesDiscovered(BluetoothGatt g,int status){
            BluetoothGattService service=g.getService(SERVICE);BluetoothGattCharacteristic characteristic=service==null?null:service.getCharacteristic(CHARACTERISTIC);
            if(status!=BluetoothGatt.GATT_SUCCESS||characteristic==null){fail(g,"El dispositivo encontrado no ofrece emparejamiento ATLAS");return;}
            try{
                events.state("verifying","Verificando el código…");
                byte[] body=new JSONObject().put("code",code).put("device",AtlasConnection.friendlyDeviceName(activity)).toString().getBytes(StandardCharsets.UTF_8);
                if(Build.VERSION.SDK_INT>=33){if(g.writeCharacteristic(characteristic,body,BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)!=BluetoothStatusCodes.SUCCESS)fail(g,"No se pudo enviar el código a ATLAS A1");}
                else{characteristic.setValue(body);if(!g.writeCharacteristic(characteristic))fail(g,"No se pudo enviar el código a ATLAS A1");}
            }catch(Exception e){fail(g,"No se pudo enviar el código a ATLAS A1");}
        }
        @Override public void onCharacteristicWrite(BluetoothGatt g,BluetoothGattCharacteristic c,int status){
            if(status!=BluetoothGatt.GATT_SUCCESS){fail(g,"Código incorrecto o caducado");return;}
            try{events.state("receiving","Completando el emparejamiento…");if(!g.readCharacteristic(c))fail(g,"No se pudo recibir el emparejamiento");}catch(SecurityException e){fail(g,"No se pudo recibir el emparejamiento");}
        }
        @Override public void onCharacteristicRead(BluetoothGatt g,BluetoothGattCharacteristic c,byte[] value,int status){if(status==BluetoothGatt.GATT_SUCCESS)deliver(g,value);else fail(g,"Código incorrecto o caducado");}
        @SuppressWarnings("deprecation") @Override public void onCharacteristicRead(BluetoothGatt g,BluetoothGattCharacteristic c,int status){if(Build.VERSION.SDK_INT<33){if(status==BluetoothGatt.GATT_SUCCESS)deliver(g,c.getValue());else fail(g,"Código incorrecto o caducado");}}
    }
}
