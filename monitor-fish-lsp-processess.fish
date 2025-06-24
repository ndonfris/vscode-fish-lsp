#!/usr/bin/env fish

function show_fish_lsp_processes
    echo (set_color blue)"=== Fish LSP Related Processes ==="(set_color normal)
    
    # Show all fish-lsp processes
    set fish_lsp_procs (pgrep -f "fish-lsp" 2>/dev/null)
    if test -n "$fish_lsp_procs"
        echo (set_color green)"Fish LSP processes:"(set_color normal)
        for pid in $fish_lsp_procs
            ps -p $pid -o pid,ppid,cmd 2>/dev/null || echo "  PID $pid (exited)"
        end
    else
        echo (set_color red)"No fish-lsp processes found"(set_color normal)
    end
    
    echo ""
    
    # Show VSCode processes
    set vscode_procs (pgrep -f "code.*extensionDevelopmentPath" 2>/dev/null)
    if test -n "$vscode_procs"
        echo (set_color green)"VSCode extension host processes:"(set_color normal)
        for pid in $vscode_procs
            ps -p $pid -o pid,ppid,cmd 2>/dev/null || echo "  PID $pid (exited)"
        end
    else
        echo (set_color yellow)"No VSCode extension development processes found"(set_color normal)
    end
    
    echo ""
    
    # Show test log files
    echo (set_color blue)"Test log files:"(set_color normal)
    ls -la /tmp/fish-lsp-test*.log 2>/dev/null || echo "No test log files found"
    
    echo ""
end

function watch_processes
    echo "Watching fish-lsp processes (Ctrl+C to exit)..."
    while true
        clear
        show_fish_lsp_processes
        sleep 2
    end
end

function cleanup_orphaned_processes
    echo (set_color yellow)"Cleaning up orphaned test processes..."(set_color normal)
    
    # Kill orphaned fish-lsp processes (be careful!)
    set fish_lsp_procs (pgrep -f "fish-lsp.*start" 2>/dev/null)
    for pid in $fish_lsp_procs
        echo "Killing fish-lsp process: $pid"
        kill $pid 2>/dev/null || true
    end
    
    # Clean up test log files
    rm -f /tmp/fish-lsp-test*.log 2>/dev/null || true
    
    # Clean up test data directories
    rm -rf .vscode-test-data-* 2>/dev/null || true
    
    echo "Cleanup completed"
end

function show_help
    echo "Fish LSP Process Monitor"
    echo ""
    echo "Usage: fish monitor-fish-lsp-processes.fish [command]"
    echo ""
    echo "Commands:"
    echo "  show     - Show current fish-lsp processes (default)"
    echo "  watch    - Continuously monitor processes"
    echo "  cleanup  - Clean up orphaned test processes"
    echo "  help     - Show this help"
end

# Parse arguments
switch $argv[1]
    case "watch" "w"
        watch_processes
    case "cleanup" "clean" "c"
        cleanup_orphaned_processes
    case "help" "h" "--help"
        show_help
    case "*"
        show_fish_lsp_processes
end
