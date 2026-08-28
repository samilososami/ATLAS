#!/usr/bin/env python3
import argparse
import os
import subprocess
import tkinter as tk


WIDTH = 1024
HEIGHT = 300
SCREEN_X = 0
SCREEN_Y = 300

BG = "#080c14"
PANEL = "#0d1320"
KEY = "#182131"
KEY_SPECIAL = "#121b2a"
KEY_MODIFIER = "#13243b"
KEY_ACTIVE = "#1267c4"
KEY_PRESSED = "#2788e8"
OUTLINE = "#2a3850"
OUTLINE_ACTIVE = "#56b3ff"
TEXT = "#eef6ff"
TEXT_MUTED = "#8ca1bd"
ACCENT = "#2b9cff"


def rounded_rectangle(canvas, x1, y1, x2, y2, radius, **kwargs):
    points = [
        x1 + radius, y1,
        x2 - radius, y1,
        x2, y1,
        x2, y1 + radius,
        x2, y2 - radius,
        x2, y2,
        x2 - radius, y2,
        x1 + radius, y2,
        x1, y2,
        x1, y2 - radius,
        x1, y1 + radius,
        x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, splinesteps=24, **kwargs)


class AtlasTouchType:
    def __init__(self, terminal_window):
        self.terminal_window = terminal_window
        self.modifiers = {"ctrl": False, "alt": False, "shift": False, "caps": False}
        self.buttons = []

        self.root = tk.Tk(className="AtlasTouchType")
        self.root.withdraw()
        self.root.title("ATLAS TOUCH TYPE")
        self.root.configure(bg=BG)
        try:
            self.root.configure(cursor="none")
        except tk.TclError:
            pass
        # A managed dock reserves real workarea instead of covering VTE rows.
        self.root.attributes('-type', 'dock')
        self.root.geometry(f"{WIDTH}x{HEIGHT}+{SCREEN_X}+{SCREEN_Y}")
        self.root.attributes("-topmost", True)

        self.canvas = tk.Canvas(
            self.root,
            width=WIDTH,
            height=HEIGHT,
            bg=BG,
            highlightthickness=0,
            bd=0,
            cursor="none",
        )
        self.canvas.pack(fill="both", expand=True)
        self.draw_panel()
        self.build_layout()

        self.root.update_idletasks()
        self.root.deiconify()
        self.root.update_idletasks()
        # Tk replaces its outer wrapper on first mapping; address the mapped
        # client, not the temporary pre-map window returned by wm_frame().
        subprocess.run(['xprop', '-name', 'ATLAS TOUCH TYPE', '-f', '_NET_WM_STRUT_PARTIAL',
                        '32c', '-set', '_NET_WM_STRUT_PARTIAL',
                        f'0, 0, 0, {HEIGHT}, 0, 0, 0, 0, 0, 0, 0, {WIDTH - 1}'],
                       check=True, stdout=subprocess.DEVNULL)
        self.root.lift()
        self.root.after(20, self.root.lift)

    def draw_panel(self):
        rounded_rectangle(self.canvas, 0, 0, WIDTH - 1, HEIGHT - 1, 15, fill=PANEL, outline="#25344b")
        self.canvas.create_text(16, 14, text="ATLAS TOUCH TYPE", anchor="w", fill=ACCENT,
                                font=("DejaVu Sans", 9, "bold"))
        self.add_button(WIDTH - 34, 4, 25, 20, "×", "close", "close", font_size=12)

    def add_button(self, x, y, width, height, label, action, kind="normal", font_size=12):
        tag = f"key_{len(self.buttons)}"
        fill = KEY
        if kind in {"special", "function"}:
            fill = KEY_SPECIAL
        elif kind == "modifier":
            fill = KEY_MODIFIER
        elif kind == "close":
            fill = "#38202a"

        shape = rounded_rectangle(
            self.canvas, x, y, x + width, y + height, 7,
            fill=fill, outline=OUTLINE, width=1, tags=(tag,),
        )
        text = self.canvas.create_text(
            x + width / 2, y + height / 2,
            text=label, fill=TEXT, font=("DejaVu Sans", font_size, "bold"), tags=(tag,),
        )
        button = {"tag": tag, "shape": shape, "text": text, "action": action,
                  "kind": kind, "normal_fill": fill}
        self.buttons.append(button)

        self.canvas.tag_bind(tag, "<ButtonPress-1>", lambda _event, b=button: self.press(b))
        self.canvas.tag_bind(tag, "<ButtonRelease-1>", lambda _event, b=button: self.release(b))

    def press(self, button):
        self.canvas.itemconfigure(button["shape"], fill=KEY_PRESSED, outline=OUTLINE_ACTIVE)

    def release(self, button):
        if button["action"] == "close":
            self.root.destroy()
            return
        self.activate(button["action"])
        self.refresh_buttons()

    def refresh_buttons(self):
        for button in self.buttons:
            action = button["action"]
            active = action.startswith("mod:") and self.modifiers.get(action.split(":", 1)[1], False)
            self.canvas.itemconfigure(
                button["shape"],
                fill=KEY_ACTIVE if active else button["normal_fill"],
                outline=OUTLINE_ACTIVE if active else OUTLINE,
            )

    def activate(self, action):
        if action == "close":
            self.root.destroy()
            return

        if action.startswith("mod:"):
            modifier = action.split(":", 1)[1]
            self.modifiers[modifier] = not self.modifiers[modifier]
            return

        combo = []
        if self.modifiers["ctrl"]:
            combo.append("ctrl")
        if self.modifiers["alt"]:
            combo.append("alt")

        letter = len(action) == 1 and action.isalpha()
        shifted = self.modifiers["shift"] or (letter and self.modifiers["caps"])
        if shifted:
            combo.append("shift")
        combo.append(action)

        env = os.environ.copy()
        env["DISPLAY"] = ":0"
        subprocess.run(
            ["xdotool", "key", "--clearmodifiers", "+".join(combo)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            env=env,
        )

        self.modifiers["ctrl"] = False
        self.modifiers["alt"] = False
        self.modifiers["shift"] = False

    def build_layout(self):
        function_row = [("Esc", "Escape", 1.25, "special")] + [
            (f"F{i}", f"F{i}", 1.0, "function") for i in range(1, 13)
        ]
        number_row = [("`", "grave", 1.0, "normal")] + [
            (str(i), str(i), 1.0, "normal") for i in range(1, 10)
        ] + [
            ("0", "0", 1.0, "normal"), ("-", "minus", 1.0, "normal"),
            ("=", "equal", 1.0, "normal"), ("⌫", "BackSpace", 2.0, "special"),
        ]
        qwerty_row = [("Tab", "Tab", 1.5, "special")] + [
            (letter, letter.lower(), 1.0, "normal") for letter in "QWERTYUIOP"
        ] + [
            ("[", "bracketleft", 1.0, "normal"), ("]", "bracketright", 1.0, "normal"),
            ("\\", "backslash", 1.25, "normal"),
        ]
        home_row = [("Caps", "mod:caps", 1.7, "modifier")] + [
            (letter, letter.lower(), 1.0, "normal") for letter in "ASDFGHJKL"
        ] + [(";", "semicolon", 1.0, "normal"), ("'", "apostrophe", 1.0, "normal")]
        lower_row = [("Shift", "mod:shift", 2.0, "modifier")] + [
            (letter, letter.lower(), 1.0, "normal") for letter in "ZXCVBNM"
        ] + [
            (",", "comma", 1.0, "normal"), (".", "period", 1.0, "normal"),
            ("/", "slash", 1.0, "normal"),
        ]
        bottom_row = [
            ("Ctrl", "mod:ctrl", 1.5, "modifier"), ("Alt", "mod:alt", 1.4, "modifier"),
            ("Espacio", "space", 7.0, "special"),
            ("←", "Left", 1.0, "special"), ("↓", "Down", 1.0, "special"),
            ("↑", "Up", 1.0, "special"), ("→", "Right", 1.0, "special"),
        ]

        left = 6
        right = 6
        gap = 3
        row_height = 41
        top = 33

        def draw_row(row, row_index, right_margin=right):
            y = top + row_index * (row_height + gap)
            total_units = sum(item[2] for item in row)
            available = WIDTH - left - right_margin - gap * (len(row) - 1)
            unit = available / total_units
            x = left
            for label, action, units, kind in row:
                key_width = unit * units
                font_size = 10 if kind == "function" else (11 if len(label) > 5 else 13)
                self.add_button(x, y, key_width, row_height, label, action, kind, font_size)
                x += key_width + gap

        draw_row(function_row, 0)
        draw_row(number_row, 1)
        enter_width = 112
        main_right = right + enter_width + gap
        draw_row(qwerty_row, 2, main_right)
        draw_row(home_row, 3, main_right)
        draw_row(lower_row, 4)

        enter_y = top + 2 * (row_height + gap)
        self.add_button(
            WIDTH - right - enter_width,
            enter_y,
            enter_width,
            row_height * 2 + gap,
            "Enter",
            "Return",
            "special",
            14,
        )

        draw_row(bottom_row, 5)

    def run(self):
        self.root.mainloop()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--terminal-window", required=True)
    args = parser.parse_args()
    AtlasTouchType(args.terminal_window).run()


if __name__ == "__main__":
    main()
