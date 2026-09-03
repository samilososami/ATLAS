package dev.atlas.a1;

import android.content.*;

public final class AtlasBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){AtlasLinkService.start(context);}
}
