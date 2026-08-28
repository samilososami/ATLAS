setopt AUTO_CD
setopt AUTO_MENU
setopt COMPLETE_IN_WORD
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_REDUCE_BLANKS
setopt INTERACTIVE_COMMENTS
setopt SHARE_HISTORY

HISTFILE=/root/.zsh_history
HISTSIZE=5000
SAVEHIST=5000

autoload -Uz compinit
mkdir -p /root/.cache/zsh
compinit -d /root/.cache/zsh/zcompdump
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'

bindkey -e
bindkey '^L' clear-screen

if (( $+commands[dircolors] )); then
  eval "$(dircolors -b)"
fi

alias ls='ls --color=auto'
alias ll='ls --color=auto -lh'
alias la='ls --color=auto -la'
alias grep='grep --color=auto'
alias egrep='grep -E --color=auto'
alias fgrep='grep -F --color=auto'

PROMPT='%F{red}%n%f@%F{cyan}%m%f:%F{blue}%~%f%# '

if [[ -r /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]]; then
  ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'
  source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh
fi

# Syntax highlighting must be sourced after widgets and key bindings.
if [[ -r /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
  source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
fi

cd /home/atlas
