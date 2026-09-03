package dev.atlas.a1;

import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Shares exactly one verified cache file, read-only, with Android's installer. */
public final class UpdateApkProvider extends ContentProvider {
    private File file(Uri uri){if(!"/update.apk".equals(uri.getPath()))throw new IllegalArgumentException("Archivo no permitido");return new File(getContext().getCacheDir(),"atlas-update.apk");}
    public boolean onCreate(){return true;}
    public String getType(Uri uri){file(uri);return "application/vnd.android.package-archive";}
    public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{if(!"r".equals(mode))throw new FileNotFoundException("Solo lectura");return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.MODE_READ_ONLY);}
    public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){
        File f=file(uri);String[] columns=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor cursor=new MatrixCursor(columns);Object[] row=new Object[columns.length];
        for(int i=0;i<columns.length;i++)row[i]=OpenableColumns.DISPLAY_NAME.equals(columns[i])?"ATLAS-update.apk":OpenableColumns.SIZE.equals(columns[i])?f.length():null;cursor.addRow(row);return cursor;
    }
    public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
    public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}
