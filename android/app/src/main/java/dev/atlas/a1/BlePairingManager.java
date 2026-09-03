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
    interface Events {void found(String name);void success(String payload);void error(String message);}
    private final Activity activity;
    private final Events events;
    private final BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothDevice device;
    private BluetoothGatt gatt;
    private boolean reported;

    BlePairingManager(Activity activity,Events events){
        this.activity=activity;this.events=events;
        BluetoothManager manager=activity.getSystemService(BluetoothManager.class);
        adapter=manager==null?null:manager.getAdapter();
    }
    boolean permitted(){return Build.VERSION.SDK_INT<31||activity.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED;}
    void scan(){
        stop();reported=false;device=null;
        if(adapter==null){events.error("Este teléfono no dispone de Bluetooth");return;}
        if(!permitted()){events.error("Permite Bluetooth para buscar ATLAS A1");return;}
        if(!adapter.isEnabled()){events.error("Activa Bluetooth para buscar ATLAS A1");return;}
        try{
            scanner=adapter.getBluetoothLeScanner();
            ScanFilter filter=new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build();
            scanner.startScan(Collections.singletonList(filter),new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),callback);
            new Handler(Looper.getMainLooper()).postDelayed(()->{if(device==null)events.error("No se encontró ningún ATLAS A1. Ejecuta atlas-app pair en la Pi.");},15000);
        }catch(SecurityException e){events.error("Android bloqueó el escaneo Bluetooth");}
    }
    void submit(String code){
        if(device==null){events.error("Primero espera a que aparezca ATLAS A1");return;}
        String digits=code==null?"":code.replaceAll("\\D","");
        if(!digits.matches("\\d{6}")){events.error("Introduce los seis dígitos");return;}
        stopScan();
        try{gatt=device.connectGatt(activity,false,new PairGatt(digits),BluetoothDevice.TRANSPORT_LE);}catch(SecurityException e){events.error("Falta permiso para conectar por Bluetooth");}
    }
    private void stopScan(){try{if(scanner!=null)scanner.stopScan(callback);}catch(Exception ignored){}scanner=null;}
    void stop(){stopScan();if(gatt!=null){try{gatt.disconnect();gatt.close();}catch(Exception ignored){}gatt=null;}}
    private final ScanCallback callback=new ScanCallback(){
        @Override public void onScanResult(int type,ScanResult result){
            if(device!=null)return;device=result.getDevice();
            String name="ATLAS A1";try{if(device.getName()!=null)name=device.getName();}catch(SecurityException ignored){}
            events.found(name);
        }
        @Override public void onScanFailed(int code){events.error("No se pudo iniciar el escaneo Bluetooth ("+code+")");}
    };
    private final class PairGatt extends BluetoothGattCallback {
        private final String code;
        PairGatt(String code){this.code=code;}
        private void fail(BluetoothGatt g,String message){if(reported)return;reported=true;events.error(message);try{g.disconnect();g.close();}catch(Exception ignored){}}
        private void deliver(BluetoothGatt g,byte[] value){
            if(reported)return;String payload=new String(value,StandardCharsets.UTF_8);
            if(!payload.startsWith("atlas1:")){fail(g,"ATLAS A1 rechazó el código");return;}
            reported=true;events.success(payload);try{g.disconnect();g.close();}catch(Exception ignored){}
        }
        @Override public void onConnectionStateChange(BluetoothGatt g,int status,int state){
            if(status!=BluetoothGatt.GATT_SUCCESS){fail(g,"No se pudo conectar con ATLAS A1");return;}
            try{if(state==BluetoothProfile.STATE_CONNECTED&&!g.requestMtu(512))g.discoverServices();else if(state==BluetoothProfile.STATE_DISCONNECTED&&!reported)fail(g,"ATLAS A1 se desconectó");}catch(SecurityException e){fail(g,"Android bloqueó la conexión Bluetooth");}
        }
        @Override public void onMtuChanged(BluetoothGatt g,int mtu,int status){try{g.discoverServices();}catch(SecurityException e){fail(g,"No se pudieron descubrir los servicios de ATLAS A1");}}
        @Override public void onServicesDiscovered(BluetoothGatt g,int status){
            BluetoothGattService service=g.getService(SERVICE);BluetoothGattCharacteristic characteristic=service==null?null:service.getCharacteristic(CHARACTERISTIC);
            if(status!=BluetoothGatt.GATT_SUCCESS||characteristic==null){fail(g,"El dispositivo encontrado no ofrece emparejamiento ATLAS");return;}
            try{
                byte[] body=new JSONObject().put("code",code).put("device",AtlasConnection.friendlyDeviceName(activity)).toString().getBytes(StandardCharsets.UTF_8);
                if(Build.VERSION.SDK_INT>=33)g.writeCharacteristic(characteristic,body,BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                else{characteristic.setValue(body);g.writeCharacteristic(characteristic);}
            }catch(Exception e){fail(g,"No se pudo enviar el código a ATLAS A1");}
        }
        @Override public void onCharacteristicWrite(BluetoothGatt g,BluetoothGattCharacteristic c,int status){
            if(status!=BluetoothGatt.GATT_SUCCESS){fail(g,"Código incorrecto o caducado");return;}
            try{g.readCharacteristic(c);}catch(SecurityException e){fail(g,"No se pudo recibir el emparejamiento");}
        }
        @Override public void onCharacteristicRead(BluetoothGatt g,BluetoothGattCharacteristic c,byte[] value,int status){if(status==BluetoothGatt.GATT_SUCCESS)deliver(g,value);else fail(g,"Código incorrecto o caducado");}
        @SuppressWarnings("deprecation") @Override public void onCharacteristicRead(BluetoothGatt g,BluetoothGattCharacteristic c,int status){if(Build.VERSION.SDK_INT<33){if(status==BluetoothGatt.GATT_SUCCESS)deliver(g,c.getValue());else fail(g,"Código incorrecto o caducado");}}
    }
}
