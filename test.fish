
# echo
set -ag --export fish_lsp_all_indexed_paths

function __test -d 'test function' -a var1 var2 var3 --inherit-variable v --on-variable fish_lsp_all_indexed_paths
    echo $fish_lsp_all_indexed_paths
    echo '$argv: '$argv
    echo '$var1: '$var1
    echo $v
    # echo '$var2: '$var2
    echo '$var3: '$var3
    if true
        echo a
    end
end
__test

fish_add_path 

# @fish-lsp-disable-next-line 4004
function foo
    __test

end

set -l arq_subcommands activateLicense refreshLicense ....
#      ^^^^^^^^^^^^^^^ getReferences()
complete -c arqc -n "not __fish_seen_subcommand_from $arq_subcommands" -a "$arq_subcommands"
# 2 references                                        ^^^^^^^^^^^^^^^       ^^^^^^^^^^^^^^^
