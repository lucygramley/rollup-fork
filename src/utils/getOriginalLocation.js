export function getOriginalLocation(sourcemapChain, location) {
    const filteredSourcemapChain = sourcemapChain.filter((sourcemap) => !sourcemap.missing);
    traceSourcemap: while (filteredSourcemapChain.length > 0) {
        const sourcemap = filteredSourcemapChain.pop();
        const line = sourcemap.mappings[location.line - 1];
        if (line) {
            const filteredLine = line.filter((segment) => segment.length > 1);
            const lastSegment = filteredLine[filteredLine.length - 1];
            let previousSegment = filteredLine[0];
            for (let segment of filteredLine) {
                if (segment[0] >= location.column || segment === lastSegment) {
                    const notMatched = segment[0] !== location.column;
                    segment = notMatched ? previousSegment : segment;
                    location = {
                        column: segment[3],
                        line: segment[2] + 1
                    };
                    continue traceSourcemap;
                }
                previousSegment = segment;
            }
        }
        throw new Error("Can't resolve original location of error.");
    }
    return location;
}
