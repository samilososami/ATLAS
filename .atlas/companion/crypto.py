"""Shared companion envelope, AES-256-GCM; relay sees routing, never plaintext."""
import base64, json, os, time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def b64(v): return base64.urlsafe_b64encode(v).decode().rstrip('=')
def unb64(v): return base64.urlsafe_b64decode(v+'='*((-len(v))%4))

class Cipher:
    def __init__(self, key, role):
        self.aes=AESGCM(unb64(key)); self.role=role; self.seen={}
    def seal(self, value):
        nonce=os.urandom(12)
        raw=json.dumps({'time':time.time(),'value':value},ensure_ascii=False).encode()
        return b64(nonce+self.aes.encrypt(nonce,raw,('atlas-v1:'+self.role).encode()))
    def open(self, box):
        now=time.time(); self.seen={k:v for k,v in self.seen.items() if now-v<180}
        raw=unb64(box)
        if len(raw)<29 or len(raw)>2_000_000: raise ValueError('Invalid envelope size')
        nonce=raw[:12]; key=b64(nonce)
        if key in self.seen: raise ValueError('Replay rejected')
        peer='app' if self.role=='pi' else 'pi'
        obj=json.loads(self.aes.decrypt(nonce,raw[12:],('atlas-v1:'+peer).encode()))
        if abs(now-obj['time'])>120: raise ValueError('Clock skew or expired envelope')
        self.seen[key]=now
        if len(self.seen)>10000: raise ValueError('Rate limit')
        return obj['value']
