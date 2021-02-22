(() => {
    console.log(`${window.origin}:widget.io/wowsers.js: starting actual widget script`);

    const when = Date.now();
    while (Date.now() - when <= 5000) {
        // this is sooooo bad....
        document.writeln('.');
    }

    document.writeln('<h2>SHAZAAAMMM!</h2>');
})();


