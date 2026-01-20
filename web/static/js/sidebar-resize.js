/**
 * Sidebar Resize Functionality
 * Allows users to drag the sidebar edge to resize its width
 */

(function() {
    'use strict';

    // Initialize sidebar resize on DOM load
    document.addEventListener('DOMContentLoaded', function() {
        const sidebar = document.querySelector('.sidebar');
        const resizeHandle = document.querySelector('.sidebar-resize-handle');

        if (!sidebar || !resizeHandle) {
            console.warn('Sidebar or resize handle not found');
            return;
        }

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        // Load saved sidebar width from localStorage
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
            sidebar.style.width = savedWidth + 'px';
        }

        // Mouse down event - start resizing
        resizeHandle.addEventListener('mousedown', function(e) {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;

            resizeHandle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            e.preventDefault();
        });

        // Mouse move event - perform resize
        document.addEventListener('mousemove', function(e) {
            if (!isResizing) return;

            const delta = e.clientX - startX;
            const newWidth = startWidth + delta;

            // Respect min and max width constraints
            const minWidth = 200;
            const maxWidth = 600;

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                sidebar.style.width = newWidth + 'px';
            }
        });

        // Mouse up event - stop resizing
        document.addEventListener('mouseup', function() {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Save the new width to localStorage
                localStorage.setItem('sidebarWidth', sidebar.offsetWidth);
            }
        });

        // Touch support for mobile/tablet devices
        resizeHandle.addEventListener('touchstart', function(e) {
            isResizing = true;
            startX = e.touches[0].clientX;
            startWidth = sidebar.offsetWidth;

            resizeHandle.classList.add('resizing');
            e.preventDefault();
        });

        document.addEventListener('touchmove', function(e) {
            if (!isResizing) return;

            const delta = e.touches[0].clientX - startX;
            const newWidth = startWidth + delta;

            const minWidth = 200;
            const maxWidth = 600;

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                sidebar.style.width = newWidth + 'px';
            }
        });

        document.addEventListener('touchend', function() {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('resizing');

                localStorage.setItem('sidebarWidth', sidebar.offsetWidth);
            }
        });
    });
})();
