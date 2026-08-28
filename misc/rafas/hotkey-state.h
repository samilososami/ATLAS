#ifndef RAFAS_HOTKEY_STATE_H
#define RAFAS_HOTKEY_STATE_H
#include <linux/input.h>
#include <stdbool.h>
#include <string.h>

/* Only a tiny sequence state, never a buffer of what somebody typed. */
struct sequence { unsigned ctrl, step; bool fired, dropped; double last; };
static bool sequence_event(struct sequence *s, unsigned type, unsigned code,
                           int value, double now) {
    if (type == EV_SYN && code == SYN_DROPPED) {
        memset(s, 0, sizeof(*s)); s->dropped = true; return false;
    }
    if (s->dropped) {
        if (type == EV_SYN && code == SYN_REPORT) s->dropped = false;
        return false;
    }
    if (type != EV_KEY || value == 2) return false;
    if (code == KEY_LEFTCTRL || code == KEY_RIGHTCTRL) {
        unsigned bit = code == KEY_LEFTCTRL ? 1 : 2;
        if (value) s->ctrl |= bit; else s->ctrl &= ~bit;
        if (!s->ctrl) { s->step = 0; s->fired = false; }
        return false;
    }
    if (value != 1 || !s->ctrl || s->fired) return false;
    if (now - s->last > 3.0) s->step = 0;
    s->last = now;
    if (code == KEY_W) {
        if (s->step == 2) { s->step = 0; s->fired = true; return true; }
        s->step = 1;
    } else if (code == KEY_O && s->step == 1) {
        s->step = 2;
    } else {
        s->step = 0;
    }
    return false;
}
#endif
