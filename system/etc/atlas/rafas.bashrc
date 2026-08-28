# Recovery stays boring on purpose: no plugins, user startup files or network.
PS1='root@\h:\w# '
PROMPT_COMMAND=
HISTFILE=/dev/null
HISTSIZE=500
umask 077
bind 'set enable-bracketed-paste on'
bind '"\C-l":clear-screen'
