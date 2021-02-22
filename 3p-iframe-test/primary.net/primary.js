console.log(`${window.origin}:index.html: main page JS executing`);
window.addEventListener('DOMContentLoaded', () => {
    console.log(`${window.origin}:index.html: DOMContentLoaded`);
    document.body.appendChild(document.createTextNode('Kilroy was here!'));
});
window.addEventListener('load', () => {
    console.log(`${window.origin}:index.html: load`);
});