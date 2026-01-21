/**
 * Split Pane Resize Functionality
 * Handles vertical and horizontal resize handles for main panes
 */

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        const splitPane = document.querySelector('.split-pane');
        const verticalHandle = document.querySelector('.pane-resize-handle--vertical');
        const horizontalHandle = document.querySelector('.pane-resize-handle--horizontal');
        const detailPane = document.querySelector('.pane--secondary');
        const bottomPane = document.querySelector('.pane--bottom');

        if (!splitPane || !verticalHandle || !horizontalHandle || !detailPane || !bottomPane) {
            console.warn('Split pane elements not found');
            return;
        }

        const widthStorageKey = 'detailPaneWidth';
        const heightStorageKey = 'detailsPaneHeight';
        const minDetailWidth = 240;
        const maxDetailWidth = 520;
        const minDetailsHeight = 160;
        const maxDetailsHeight = 420;

        const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

        const getMaxDetailWidth = () => {
            const paneWidth = splitPane.getBoundingClientRect().width;
            const calculatedMax = paneWidth > 0 ? paneWidth - minDetailWidth : maxDetailWidth;
            return Math.max(minDetailWidth, Math.min(maxDetailWidth, calculatedMax));
        };

        const getMaxDetailsHeight = () => {
            const paneHeight = splitPane.getBoundingClientRect().height;
            const calculatedMax = paneHeight > 0 ? paneHeight - minDetailsHeight : maxDetailsHeight;
            return Math.max(minDetailsHeight, Math.min(maxDetailsHeight, calculatedMax));
        };

        const applyDetailWidth = (value) => {
            const clamped = clamp(value, minDetailWidth, getMaxDetailWidth());
            splitPane.style.setProperty('--detail-pane-width', `${clamped}px`);
        };

        const applyDetailsHeight = (value) => {
            const clamped = clamp(value, minDetailsHeight, getMaxDetailsHeight());
            splitPane.style.setProperty('--details-pane-height', `${clamped}px`);
        };

        const savedWidth = Number(localStorage.getItem(widthStorageKey));
        if (!Number.isNaN(savedWidth) && savedWidth > 0) {
            applyDetailWidth(savedWidth);
        }

        const savedHeight = Number(localStorage.getItem(heightStorageKey));
        if (!Number.isNaN(savedHeight) && savedHeight > 0) {
            applyDetailsHeight(savedHeight);
        }

        let isResizing = false;
        let resizeAxis = null;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        const startResize = (axis, clientX, clientY) => {
            isResizing = true;
            resizeAxis = axis;
            startX = clientX;
            startY = clientY;
            startWidth = detailPane.getBoundingClientRect().width;
            startHeight = bottomPane.getBoundingClientRect().height;

            document.body.style.userSelect = 'none';
            document.body.style.cursor = axis === 'vertical' ? 'col-resize' : 'row-resize';
        };

        const stopResize = () => {
            if (!isResizing) return;

            isResizing = false;
            resizeAxis = null;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';

            localStorage.setItem(widthStorageKey, Math.round(detailPane.getBoundingClientRect().width));
            localStorage.setItem(heightStorageKey, Math.round(bottomPane.getBoundingClientRect().height));
        };

        const handleResize = (clientX, clientY) => {
            if (!isResizing) return;

            if (resizeAxis === 'vertical') {
                const deltaX = clientX - startX;
                const nextWidth = startWidth - deltaX;
                applyDetailWidth(nextWidth);
                verticalHandle.classList.add('resizing');
            }

            if (resizeAxis === 'horizontal') {
                const deltaY = clientY - startY;
                const nextHeight = startHeight - deltaY;
                applyDetailsHeight(nextHeight);
                horizontalHandle.classList.add('resizing');
            }
        };

        verticalHandle.addEventListener('mousedown', (event) => {
            startResize('vertical', event.clientX, event.clientY);
            event.preventDefault();
        });

        horizontalHandle.addEventListener('mousedown', (event) => {
            startResize('horizontal', event.clientX, event.clientY);
            event.preventDefault();
        });

        document.addEventListener('mousemove', (event) => {
            handleResize(event.clientX, event.clientY);
        });

        document.addEventListener('mouseup', () => {
            verticalHandle.classList.remove('resizing');
            horizontalHandle.classList.remove('resizing');
            stopResize();
        });

        verticalHandle.addEventListener('touchstart', (event) => {
            startResize('vertical', event.touches[0].clientX, event.touches[0].clientY);
            event.preventDefault();
        });

        horizontalHandle.addEventListener('touchstart', (event) => {
            startResize('horizontal', event.touches[0].clientX, event.touches[0].clientY);
            event.preventDefault();
        });

        document.addEventListener('touchmove', (event) => {
            handleResize(event.touches[0].clientX, event.touches[0].clientY);
        });

        document.addEventListener('touchend', () => {
            verticalHandle.classList.remove('resizing');
            horizontalHandle.classList.remove('resizing');
            stopResize();
        });
    });
})();
