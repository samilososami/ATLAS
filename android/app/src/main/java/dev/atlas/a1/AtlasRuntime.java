package dev.atlas.a1;

import android.content.Context;

final class AtlasRuntime {
    private static AtlasConnection connection;
    static synchronized AtlasConnection connection(Context context){
        if(connection==null)connection=new AtlasConnection(context.getApplicationContext());
        return connection;
    }
    static synchronized void reset(){
        if(connection!=null)connection.close();
        connection=null;
    }
}
