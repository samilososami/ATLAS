#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <glob.h>
#include <linux/input.h>
#include <poll.h>
#include <signal.h>
#include <spawn.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/inotify.h>
#include <sys/ioctl.h>
#include <time.h>
#include <unistd.h>
#include "hotkey-state.h"

#define MAX_DEVICES 64
struct keyboard { int fd; char path[128]; struct sequence state; };
static struct keyboard keyboards[MAX_DEVICES];
static size_t count;
static volatile sig_atomic_t stopping;
extern char **environ;
static void stop_handler(int sig) { (void)sig; stopping = 1; }
static double monotonic(void) {
    struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec + t.tv_nsec / 1e9;
}
static bool bit_set(const unsigned char *bits, unsigned key) {
    return bits[key / 8] & (1u << (key % 8));
}
static void remove_keyboard(size_t i) {
    close(keyboards[i].fd);
    keyboards[i] = keyboards[--count];
}
static void discover(void) {
    glob_t paths;
    if (glob("/dev/input/event*", 0, NULL, &paths) != 0) return;
    for (size_t p = 0; p < paths.gl_pathc && count < MAX_DEVICES; p++) {
        const char *path = paths.gl_pathv[p];
        bool known = false;
        for (size_t i = 0; i < count; i++)
            if (!strcmp(keyboards[i].path, path)) known = true;
        if (known) continue;
        int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
        if (fd < 0) continue;
        struct input_id id;
        unsigned char keys[(KEY_MAX + 8) / 8] = {0};
        if (ioctl(fd, EVIOCGID, &id) < 0 || id.bustype != BUS_USB ||
            ioctl(fd, EVIOCGBIT(EV_KEY, sizeof(keys)), keys) < 0 ||
            !bit_set(keys, KEY_W) || !bit_set(keys, KEY_O) ||
            (!bit_set(keys, KEY_LEFTCTRL) && !bit_set(keys, KEY_RIGHTCTRL))) {
            close(fd); continue;
        }
        struct keyboard *k = &keyboards[count++];
        memset(k, 0, sizeof(*k)); k->fd = fd;
        snprintf(k->path, sizeof(k->path), "%s", path);
    }
    globfree(&paths);
}
static void activate(void) {
    static double last;
    double now = monotonic();
    if (last && now - last < 2.0) return;
    last = now;
    pid_t pid;
    char *args[] = {"systemctl", "--no-block", "start", "atlas-rafas-activate.service", NULL};
    int error = posix_spawn(&pid, "/usr/bin/systemctl", NULL, NULL, args, environ);
    if (error) fprintf(stderr, "RAFAS activation could not be queued: %s\n", strerror(error));
    else fprintf(stderr, "RAFAS requested by USB hotkey\n");
}
int main(void) {
    if (geteuid() != 0) { fputs("Run as root or use atlas-rafas-hotkey.service.\n", stderr); return 1; }
    struct sigaction sa = {0}; sa.sa_handler = stop_handler;
    sigaction(SIGTERM, &sa, NULL); sigaction(SIGINT, &sa, NULL);
    signal(SIGCHLD, SIG_IGN);
    int notify = inotify_init1(IN_NONBLOCK | IN_CLOEXEC);
    if (notify < 0 || inotify_add_watch(notify, "/dev/input",
        IN_CREATE | IN_DELETE | IN_ATTRIB | IN_MOVED_TO | IN_MOVED_FROM) < 0) {
        perror("RAFAS input hotplug watch"); return 1;
    }
    discover();
    fprintf(stderr, "RAFAS ready: %zu USB keyboard(s); waiting for input events\n", count);
    while (!stopping) {
        struct pollfd fds[MAX_DEVICES + 1] = {{.fd = notify, .events = POLLIN}};
        for (size_t i = 0; i < count; i++) fds[i+1] = (struct pollfd){keyboards[i].fd, POLLIN, 0};
        int ready = poll(fds, count + 1, -1); /* No polling timer, no idle CPU loop. */
        if (ready < 0) { if (errno == EINTR) continue; perror("poll"); break; }
        for (size_t i = count; i-- > 0;) {
            if (fds[i+1].revents & (POLLERR | POLLHUP | POLLNVAL)) { remove_keyboard(i); continue; }
            if (!(fds[i+1].revents & POLLIN)) continue;
            struct input_event events[64];
            ssize_t n;
            while ((n = read(keyboards[i].fd, events, sizeof(events))) > 0) {
                for (size_t e = 0; e < (size_t)n / sizeof(events[0]); e++)
                    if (sequence_event(&keyboards[i].state, events[e].type, events[e].code,
                                       events[e].value, monotonic())) activate();
            }
            if (n == 0 || (n < 0 && errno != EAGAIN && errno != EINTR)) remove_keyboard(i);
        }
        if (fds[0].revents & POLLIN) {
            char buffer[4096];
            while (read(notify, buffer, sizeof(buffer)) > 0) {}
            discover(); /* Scan only at startup or after a kernel hotplug event. */
        }
    }
    while (count) remove_keyboard(count - 1);
    close(notify);
    return stopping ? 0 : 1;
}
