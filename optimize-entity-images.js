// scripts/optimize-entity-images.js
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// --- Configuration ---
const imagesDir = path.resolve('public/images/entities'); // Adjust if your path is different
const maxHeight = 400;
const jpgQuality = 85; // Quality setting for JPG (0-100, higher is better quality/larger size)
const whiteBackground = { r: 255, g: 255, b: 255 }; // Define white background color
// ---------------------

async function optimizeImages() {
    console.log(`Starting optimization in: ${imagesDir}`);
    console.log(`Max Height: ${maxHeight}px, JPG Quality: ${jpgQuality}, Background: White`); // Updated log
    console.log("IMPORTANT: This will REPLACE original PNG files with optimized JPGs.");

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    try {
        const files = fs.readdirSync(imagesDir);

        for (const file of files) {
            const inputPath = path.join(imagesDir, file);
            const fileStats = fs.statSync(inputPath);

            // Skip directories
            if (!fileStats.isFile()) {
                skippedCount++;
                continue;
            }

            // Process only PNG files
            if (path.extname(file).toLowerCase() !== '.png') {
                skippedCount++;
                continue;
            }

            const parsedPath = path.parse(file);
            const outputFilename = `${parsedPath.name}.jpg`; // New filename with .jpg extension
            const outputPath = path.join(imagesDir, outputFilename);

            console.log(`Processing: ${file} -> ${outputFilename}`);

            try {
                const image = sharp(inputPath);
                const metadata = await image.metadata();

                // Only resize if height is greater than maxHeight
                const needsResize = metadata.height && metadata.height > maxHeight;

                let processingPipeline = image;
                if (needsResize) {
                    console.log(`  Resizing from ${metadata.width}x${metadata.height} to height ${maxHeight}...`);
                    processingPipeline = processingPipeline.resize({ height: maxHeight });
                } else {
                    console.log(`  Height (${metadata.height || 'unknown'}) is within limit, no resize needed.`);
                }

                // --- ADD FLATTEN HERE ---
                // Flatten transparency onto a white background *before* converting to JPEG
                processingPipeline = processingPipeline.flatten({ background: whiteBackground });
                console.log('  Applied white background for transparency.');
                // ------------------------

                // Convert to JPG and save
                await processingPipeline
                    .jpeg({ quality: jpgQuality })
                    .toFile(outputPath);

                console.log(`  Successfully created: ${outputFilename}`);
                processedCount++;

                // Delete the original PNG file *after* successful JPG creation
                try {
                    fs.unlinkSync(inputPath);
                    console.log(`  Deleted original: ${file}`);
                } catch (deleteError) {
                    console.error(`  ERROR deleting original file ${file}:`, deleteError);
                }

            } catch (processError) {
                console.error(`  ERROR processing file ${file}:`, processError);
                errorCount++;
            }
        } // End loop

    } catch (readDirError) {
        console.error(`FATAL ERROR reading directory ${imagesDir}:`, readDirError);
        errorCount++;
    } finally {
        console.log("\n--- Optimization Complete ---");
        console.log(`Processed (PNG -> JPG): ${processedCount}`);
        console.log(`Skipped (Non-PNG/Dirs): ${skippedCount}`);
        console.log(`Errors:                 ${errorCount}`);
        if (errorCount > 0) {
             console.warn("Some files encountered errors during processing. Check logs above.");
        }
        console.log("---------------------------");
    }
}

// Run the optimization function
optimizeImages();