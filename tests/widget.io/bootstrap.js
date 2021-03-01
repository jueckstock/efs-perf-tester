window.addEventListener('DOMContentLoaded', () => {
    const slot = document.querySelector('#amazing-widget-slot');
    const iframe = document.createElement('iframe');
    slot.replaceWith(iframe);
    iframe.src = `//widget.io/widget.html${window.location.hash}`;
    console.log(`${window.origin}:widget.io/bootstrap.js: widget iframe injected`);
});