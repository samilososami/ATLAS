"""No hardware or audio server is needed for these startup regression checks."""
import importlib.machinery
import importlib.util
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch

path = Path(__file__).parent / 'libexec/atlas-screen-audio-ready'
loader = importlib.machinery.SourceFileLoader('audio_ready', str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
audio = importlib.util.module_from_spec(spec)
loader.exec_module(audio)


class AudioReadyTests(TestCase):
    def test_real_output_or_missing_server_are_untouched(self):
        for output in ('bluez_output.headphones', audio.SINK, ''):
            with self.subTest(output=output), patch.object(audio, 'pactl', return_value=output) as call:
                audio.recover()
                call.assert_called_once_with('get-default-sink')

    def test_missing_card_is_loaded_and_existing_streams_moved(self):
        state = {'sink': 'auto_null'}
        def command(*args):
            if args == ('get-default-sink',):
                return state['sink']
            if args[0] == 'load-module':
                state['sink'] = audio.SINK
            if args == ('list', 'short', 'sinks'):
                return '1\t' + audio.SINK + '\tmodule-alsa-card.c'
            if args == ('list', 'short', 'sink-inputs'):
                return '7\t0\t9'
            return ''
        with patch.object(audio, 'pactl', side_effect=command) as call, \
                patch.object(audio, 'hdmi_device', return_value='3'):
            audio.recover()
        self.assertTrue(any(c.args[0] == 'load-module' and 'device_id=3' in c.args
                            for c in call.call_args_list))
        call.assert_any_call('move-sink-input', '7', audio.SINK)

    def test_missing_hardware_has_only_three_attempts(self):
        def command(*args):
            return 'auto_null' if args == ('get-default-sink',) else ''
        with patch.object(audio, 'pactl', side_effect=command) as call, \
                patch.object(audio, 'hdmi_device', return_value=None), \
                patch.object(audio.time, 'sleep') as sleep:
            audio.recover()
        self.assertEqual(sleep.call_count, 2)
        self.assertFalse(any(c.args[0] == 'load-module' for c in call.call_args_list))

    def test_available_card_is_reenabled(self):
        def command(*args):
            if args == ('get-default-sink',): return 'auto_null'
            if args == ('list', 'short', 'cards'): return '1\t' + audio.CARD
            if args == ('list', 'short', 'sinks'): return '1\t' + audio.SINK
            return ''
        with patch.object(audio, 'pactl', side_effect=command) as call:
            audio.recover()
        call.assert_any_call('set-card-profile', audio.CARD, 'output:hdmi-stereo')
        call.assert_any_call('set-default-sink', audio.SINK)
        self.assertFalse(any(c.args[0] == 'load-module' for c in call.call_args_list))


if __name__ == '__main__':
    main()
