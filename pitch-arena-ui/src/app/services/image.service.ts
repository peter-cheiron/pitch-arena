import { inject, Injectable } from "@angular/core";
import {
  getDownloadURL,
  getMetadata,
  getStorage,
  ref,
  uploadBytes,
} from "@angular/fire/storage";
// @ts-ignore - types provided by env.d.ts
import { ImageCompressService } from "./image_compress.service";

@Injectable({
  providedIn: "root",
})
export class ImageService {
  constructor() {}

  /**
   *
   * BUG this broke all of my images because its not using the generated id anymore :-(
   *
   * @param path base path
   * @param file
   * @param uploadEvent
   */
  private uploadFile(path: string, file: File, fileName, uploadEvent) {
    if (file) {
      const storage = getStorage();
      const dest = path + "/" + fileName;
      const storageRef = ref(storage, dest);
      uploadBytes(storageRef, file, {
        cacheControl: "public, max-age=31536000, immutable",
      }).then((value) => {
        uploadEvent({
          event: value,
          path: dest,
        });
      });
    }
  }

  /**
   * Should be good for the removal everywhere of this method.
   *
   * @param filePath
   * @param file
   * @param done
   */
  private saveImage(filePath, file, fileName, done) {
    this.uploadFile(filePath, file, fileName, (result) => {
      this.loadImage(
        result.path,
        (imageURL) => {
          done(imageURL);
        },
        (error) => {
          console.error(error);
        }
      );
    });
  }

  /**
   *
   * @param path to load from
   * @param done the returned usable url
   * @param error the returned unusable error
   */
  loadImage(path, done, error) {
    const storage = getStorage();
    const imageRef = ref(storage, path);
    getDownloadURL(imageRef).then(
      (imageURL) => {
        done(imageURL);
      },
      (onDamn) => {
        error(onDamn);
      }
    );
  }

  getFileSize(filePath, result, totalFailure) {
    const fileRef = ref(getStorage(), filePath); // Reference to the file

    getMetadata(fileRef)
      .then((metadata) => {
        const sizeInMB = (metadata.size / (1024 * 1024)).toFixed(2); // Convert bytes to MB
        result(`${sizeInMB} MB`);
      })
      .catch((error) => {
        totalFailure("Error fetching metadata:", error);
      });
  }

  /**
   * Use to get the invitation for example.
   *
   * @param path
   * @param download
   */
  getDownload(path, download) {
    getDownloadURL(ref(getStorage(), path)).then((url) => {
      download(url);
    });
  }

  logStats = true;

  /**
   * Where the fuck is the name of the file set?
   * @param file
   * @param path
   * @param id remove this I think as its not needed
   * @param useDNS
   * @param image
   */
  imageCompress = inject(ImageCompressService);
  handleFile(file, path, image, error = (() => {})) {
    this.imageCompress
      .compress(file, {
        maxMP: 0.6, // ~2.5 megapixels
        maxW: 1200,
        maxH: 1200, // also cap long edges (optional)
        quality: 0.8, // starting point
        preferWebP: true, // will pick JPEG if smaller
        flatten: true, // paint white behind transparent images
        targetBytes: 120_000, // aim for ≤ ~342 KB (optional)
        minQuality: 0.32, // don't go below this in the search
      })
      .then((result) => {
        console.log("IN  ", (result.originalBytes / 1024).toFixed(1), "KB");
        console.log(
          "OUT ",
          (result.finalBytes / 1024).toFixed(1),
          "KB",
          result.mime,
          result.width,
          "x",
          result.height
        );
        const name = crypto.randomUUID() + ".webp";//can it not be a webp?
        this.saveImage(path, result.file, name, (imageResult) => {
          image(imageResult);
        });
      });

    /*
    this.imageCompress
      .compress(file, {
        maxMP: 3.5,
        quality: 0.8,
        preferWebP: true,
        flatten: true,
      })
      .then((out) => {
        console.log("IN", file.type, file.size / 1024, "KB");
        console.log("OUT", out.type, out.size / 1024, "KB");
        console.log(out)
        const name = crypto.randomUUID() + ".webp";
        this.saveImage(path, out, name, (imageResult) => {
          image(imageResult);
        });
      });*/

    /*
    const fileSizeInKB = (file.size / 1024).toFixed(2); // Size in KB
    const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2); // Size in MB

    if (this.logStats) console.log(`File Name: ${file.name}`);
    if (this.logStats)
      console.log(`File Size: ${fileSizeInKB} KB (${fileSizeInMB} MB)`);

    this.webpEncode(file, {
      maxMP: 3.5, // ~2048×1700-ish
      targetBytes: 400 * 1024, // 400 KB target
      minQuality: 45,
      maxQuality: 88,
      flatten: true,
      keepOriginalIfSmaller: true,
    }).then((fileEncoded) => {
      const compressedKb = fileEncoded.size / 1024;
      if (this.logStats)
        console.log(
          "compression",
          `${compressedKb.toFixed(2)} KB`,
          `${Math.round(
            ((file.size / 1024 - compressedKb) / (file.size / 1024)) * 1e2
          )}%`
        );

      this.saveImage(path, fileEncoded, (imageResult) => {
        image(imageResult);
      });
    });*/
  }
}
