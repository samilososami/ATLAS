if [ -f /etc/bash.bashrc ]; then
  . /etc/bash.bashrc
fi

if [ -f /root/.bashrc ]; then
  . /root/.bashrc
fi

if command -v dircolors >/dev/null 2>&1; then
  eval "$(dircolors -b)"
fi

alias ls='ls --color=auto'
alias ll='ls --color=auto -lh'
alias la='ls --color=auto -la'
alias grep='grep --color=auto'
alias egrep='grep -E --color=auto'
alias fgrep='grep -F --color=auto'

PS1='\[\e[1;31m\]\u\[\e[0m\]@\[\e[1;36m\]\h\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ '
HISTFILE=/root/.bash_history
HISTCONTROL=ignoreboth
shopt -s checkwinsize

cd /home/atlas
