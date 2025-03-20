# echo
set -ga --export fish_lsp_all_indexed_paths

# @fish-lsp-disable
function __test 'test function' -a var1 var2 var3
    echo '$argv: '$argv
    echo '$var1: '$var1
    echo '$var2: '$var2
    echo '$var3: '$var3
    if true
        echo a
    end
end