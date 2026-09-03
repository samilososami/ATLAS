package dev.atlas.a1;

public final class UpdatePolicySelfTest {
    private static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args){
        require(UpdatePolicy.compare("android-v0.1.10","0.1.9-preview")>0,"semantic ordering");
        require(UpdatePolicy.compare("android-v1.0.0","9.9.9")<0,"major ordering");
        require(UpdatePolicy.asset("https://github.com/samilososami/ATLAS/releases/download/android-v0.1.3/ATLAS-0.1.3-preview.apk","android-v0.1.3","ATLAS-0.1.3-preview.apk"),"valid asset");
        require(!UpdatePolicy.asset("https://evil.invalid/ATLAS-0.1.3-preview.apk","android-v0.1.3","ATLAS-0.1.3-preview.apk"),"reject host");
        require(!UpdatePolicy.asset("https://github.com/samilososami/ATLAS/releases/download/v0.1.3/ATLAS-0.1.3-preview.apk","v0.1.3","ATLAS-0.1.3-preview.apk"),"reject non Android release");
        require(!UpdatePolicy.asset("https://github.com/samilososami/ATLAS/releases/download/android-v0.1.3/other.apk","android-v0.1.3","other.apk"),"reject arbitrary asset");
    }
}
