// const { nullArtist } = require("../models/null_responses");

const AWS = require("aws-sdk");
const config = require("../config");
const logger = require("../lib/logger");

class S3Client {
  constructor() {
    AWS.config.credentials = new AWS.SharedIniFileCredentials({
      profile: config.profile,
    });
    this.client = new AWS.S3();
    this.artistNames = [];
    this.albumNames = [];
    this.songPaths = [];
    this.baseParams = {
      Bucket: config.bucket /* required */,
      Delimiter: "/",
    };
  }

  /**
   * Calls listObjects on the music bucket and parses a list of "artistNames"
   */
  listArtists() {
    return new Promise((resolve, reject) => {
      this.client.listObjectsV2(this.baseParams, (err, res) => {
        if (err) {
          reject(err);
        } else {
          if (this.artistNames.length == 0) {
            logger.debug("S3 List Objects Call made: listing artists");
            for (let i in res.CommonPrefixes) {
              this.artistNames.push(res.CommonPrefixes[i].Prefix);
            }
          }
          resolve(this.artistNames);
        }
      });
    });
  }

  /**
   * Calls listObjects with an artistName prefix to compile a list of "albumNames"
   * for a particular artist
   * @param {string} artistPath The artist prefix used to query albums in s3 by
   * a particular artis
   */
  listAlbums(artistPath) {
    let params = this.baseParams;
    params.Prefix = artistPath + "/";
    return new Promise((resolve, reject) => {
      logger.info(`S3 List Objects Call made: listing ${artistPath} albums`);
      this.client.listObjectsV2(params, (err, res) => {
        if (err) {
          logger.error(err);
          reject(err);
        }
        this.albumNames = [];
        res.CommonPrefixes.forEach((obj) => {
          let albumName = obj.Prefix.split("/");
          albumName = albumName[albumName.length - 2];
          this.albumNames.push(albumName);
        });
        resolve(this.albumNames);
      });
    });
  }

  /**
   * Calls listObjects with an artistName/albumName prefix to fetch songs for a given
   * artist and album
   * @param {string} albumPath The artistName/albumName path prefix to used to query
   * songs on a particular album
   */
  listSongs(albumPath) {
    let params = this.baseParams;
    params.Prefix = albumPath + "/";
    return new Promise((resolve, reject) => {
      this.client.listObjectsV2(params, (err, res) => {
        if (err) {
          logger.error(err);
          reject(err);
        } else {
          this.songPaths = [];
          res.Contents.forEach((obj) => {
            let songName = obj.Key.split("/");
            songName = songName[songName.length - 1];
            if (songName) {
              this.songPaths.push(songName);
            }
          });
          resolve(this.songPaths);
        }
      });
    });
  }

  /**
   * Returns a read stream object for an audio file.
   * @param {string} songPath The artistName/albumName/songName path prefix
   * for fetching a specific audio file from S3
   */
  playMusic(songPath) {
    let params = { Bucket: config.bucket, Key: songPath };
    return this.client.getObject(params).createReadStream();
  }

  /**
   * Requests the artist information from the s3 cache
   * @param {string} artistName The artistName, as it exists in the music files bucket
   * @param {*} cacheBucket The name of the bucket used for caching the DiscogsAPI response
   */
  getArtistCache(artistName, cacheBucket = "discogs-api-cache") {
    return new Promise((resolve, reject) => {
      // try {
      let key = `artists/${S3Client.normalizeArtistName(artistName)}.json`;
      this.client.getObject({ Bucket: cacheBucket, Key: key }, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(JSON.parse(res.Body.toString("utf-8")));
        }
      });
    });
  }

  /**
   *
   * @param {string} artistName The artistName, as it exists in the music files bucket
   * @param {Object} jsonObj The jsonFile in object form to be pushed to s3
   * @param {*} cacheBucket The name of the bucket used for caching the DiscogsAPI response
   */
  putArtistCache(artistName, jsonObj, cacheBucket = "discogs-api-cache") {
    const params = {
      Bucket: cacheBucket,
      Key: `artists/${S3Client.normalizeArtistName(artistName)}.json`,
      Body: Buffer.from(JSON.stringify(jsonObj), "binary"),
    };

    return new Promise((resolve, reject) => {
      this.client.putObject(params, (err, res) => {
        if (err) {
          reject(err);
        }
        resolve({ status: 200 });
      });
    });
  }

  /**
   * Normalizes the artist name string for more reliability in our caching file structure
   * @param {string} artistName The name of an artist as seen in s3
   */
  static normalizeArtistName(artistName) {
    return artistName.replace(/ /g, "-").replace(/\//g, "");
  }
}

const s3Client = new S3Client();
// s3Client.putArtistCache("Led Zeppelin").then(res => console.log(res))
// s3Client.getArtistCache("Led Zeppelin").then(res => {
//   console.log(res)
// })

module.exports = { s3Client, S3Client };
