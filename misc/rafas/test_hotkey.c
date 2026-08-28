#include <assert.h>
#include <stdio.h>
#include "hotkey-state.h"
static bool key(struct sequence *s, int code, int value, double t) {
    return sequence_event(s, EV_KEY, code, value, t);
}
static bool wow(struct sequence *s, double t) {
    key(s, KEY_W, 1, t); key(s, KEY_W, 0, t+.1);
    key(s, KEY_O, 1, t+.2); key(s, KEY_O, 0, t+.3);
    return key(s, KEY_W, 1, t+.4);
}
int main(void) {
    struct sequence s = {0};
    assert(!wow(&s, 1));
    key(&s, KEY_LEFTCTRL, 1, 2); assert(wow(&s, 2));
    assert(!wow(&s, 3)); /* one activation per held Ctrl */
    key(&s, KEY_LEFTCTRL, 0, 4); key(&s, KEY_RIGHTCTRL, 1, 4);
    assert(wow(&s, 4));
    s = (struct sequence){0}; key(&s, KEY_LEFTCTRL, 1, 1);
    key(&s, KEY_W, 1, 1); key(&s, KEY_O, 1, 5);
    assert(!key(&s, KEY_W, 1, 6)); /* expired */
    key(&s, KEY_A, 1, 6); key(&s, KEY_O, 1, 6);
    assert(!key(&s, KEY_W, 1, 6)); /* different keys cancel */
    key(&s, KEY_LEFTCTRL, 0, 7); key(&s, KEY_LEFTCTRL, 1, 7);
    key(&s, KEY_W, 1, 7); key(&s, KEY_O, 1, 7);
    assert(!key(&s, KEY_W, 2, 7)); /* auto-repeat is not another press */
    sequence_event(&s, EV_SYN, SYN_DROPPED, 0, 8);
    assert(!wow(&s, 8));
    sequence_event(&s, EV_SYN, SYN_REPORT, 0, 8);
    assert(!wow(&s, 9));
    key(&s, KEY_LEFTCTRL, 1, 10); assert(wow(&s, 10));
    puts("RAFAS hotkey state: all checks passed");
}
