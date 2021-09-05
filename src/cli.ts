#!/usr/bin/env node
require("./index")
    .run()
    .catch((error: any) => {
        console.error(error);
        process.exit(1);
    });
