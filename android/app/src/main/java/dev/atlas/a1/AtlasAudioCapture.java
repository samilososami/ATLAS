package dev.atlas.a1;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.*;
import android.util.Base64;
import java.io.*;
import java.nio.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

/** AudioRecord fallback for WebView devices whose getUserMedia source fails. */
final class AtlasAudioCapture implements AutoCloseable {
    private final Context context;
    private final AtomicBoolean recording=new AtomicBoolean();
    private AudioRecord recorder;
    private Thread worker;
    private ByteArrayOutputStream audio;
    private int sourceRate;
    AtlasAudioCapture(Context context){this.context=context.getApplicationContext();}

    synchronized JSONObject start(int requestedRate,int channels)throws Exception{
        if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("permission_required: RECORD_AUDIO");
        if(recording.get())return new JSONObject().put("recording",true).put("sampleRate",sourceRate);
        if(channels!=1)throw new IllegalArgumentException("Solo se admite audio mono");
        Exception last=null;int[] rates={Math.max(16000,Math.min(48000,requestedRate)),48000,44100,24000,16000};
        int[] sources={MediaRecorder.AudioSource.VOICE_RECOGNITION,MediaRecorder.AudioSource.MIC,MediaRecorder.AudioSource.VOICE_COMMUNICATION};
        outer:for(int source:sources)for(int candidate:rates){
            AudioRecord next=null;try{int min=AudioRecord.getMinBufferSize(candidate,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);if(min<=0)continue;
                next=new AudioRecord.Builder().setAudioSource(source)
                    .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(candidate).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build()).setBufferSizeInBytes(Math.max(min*2,8192)).build();
                if(next.getState()!=AudioRecord.STATE_INITIALIZED){next.release();continue;}next.startRecording();if(next.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING){next.release();continue;}
                recorder=next;sourceRate=candidate;break outer;
            }catch(Exception error){last=error;if(next!=null)try{next.release();}catch(Exception ignored){}}
        }
        if(recorder==null)throw new IOException("No se pudo iniciar la fuente de audio nativa",last);
        audio=new ByteArrayOutputStream();recording.set(true);AudioRecord active=recorder;worker=new Thread(()->capture(active),"atlas-audio-capture");worker.setDaemon(true);worker.start();
        return new JSONObject().put("recording",true).put("sampleRate",sourceRate).put("channelCount",1);
    }
    private void capture(AudioRecord active){
        byte[] buffer=new byte[8192];int maximum=sourceRate*2*65;
        while(recording.get()&&audio.size()<maximum){int read=active.read(buffer,0,Math.min(buffer.length,maximum-audio.size()),AudioRecord.READ_BLOCKING);if(read>0)audio.write(buffer,0,read);else if(read<0)break;}
        recording.set(false);
    }
    synchronized JSONObject stop()throws Exception{
        if(recorder==null)return new JSONObject().put("audio","").put("sampleRate",24000);
        recording.set(false);try{recorder.stop();}catch(Exception ignored){}if(worker!=null)try{worker.join(1800);}catch(InterruptedException e){Thread.currentThread().interrupt();}
        recorder.release();recorder=null;worker=null;byte[] raw=audio==null?new byte[0]:audio.toByteArray();audio=null;byte[] pcm=sourceRate==24000?raw:resample(raw,sourceRate,24000);
        return new JSONObject().put("audio",Base64.encodeToString(pcm,Base64.NO_WRAP)).put("sampleRate",24000).put("channelCount",1).put("bytes",pcm.length);
    }
    private byte[] resample(byte[] raw,int from,int to){
        if(raw.length<2||from<=0)return new byte[0];
        ShortBuffer source=ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer();int outCount=(int)((long)source.remaining()*to/from);ByteBuffer out=ByteBuffer.allocate(outCount*2).order(ByteOrder.LITTLE_ENDIAN);double ratio=(double)from/to;
        for(int i=0;i<outCount;i++){double position=i*ratio;int a=Math.min(source.limit()-1,(int)position),b=Math.min(source.limit()-1,a+1);double fraction=position-a;out.putShort((short)Math.round(source.get(a)+(source.get(b)-source.get(a))*fraction));}return out.array();
    }
    @Override public synchronized void close(){try{stop();}catch(Exception ignored){}}
}
