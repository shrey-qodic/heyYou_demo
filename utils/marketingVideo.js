import axios from 'axios';
import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
import { getMainContactFromRecord } from './zoho/zohoServices.js';

dotenv.config();

const API_KEY = process.env.SYNTHESIA_TOKEN;
const API_URL = 'https://upload.api.synthesia.io/v2/assets';

const uploadAsset = async (videoPath) => {
  try {
  return new Promise((resolve, reject) => {
      const file = fs.createReadStream(videoPath);

      const options = {
          method: 'POST',
          headers: {
              'Authorization': API_KEY,
              'Content-Type': 'video/mp4'
          }
      };

      const req = https.request(API_URL, options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
              data += chunk;
          });

          res.on('end', () => {
              resolve(JSON.parse(data));
          });
      });

      req.on('error', (error) => {
          reject(error);
      });

      file.pipe(req);
  });
} catch(err){
  console.log(err)
}

};

const createSyntheticVideo = async (assetId, companyName, mainContact) => {
  try {
    const payload = {
      test: false,
      title: companyName,
      description: `${companyName} Video`,
      visibility: "public",
      callbackId: "harelsarag7@gmail.com",
      input: [{
        scriptText: ``,
        avatar: "",
        avatarSettings: {
          voice: "1364e02b-bdae-4d39-bc2d-6c4a34814968",
          horizontalAlign: "left",
          scale: 0.4,
          style: "rectangular",
        },
        background: assetId, 
        backgroundSettings: {
          videoSettings: {
            shortBackgroundContentMatchMode: "freeze",
            longBackgroundContentMatchMode: "trim"
          }
        }
      }]
    };

    const template = generateScriptAndAvatar(mainContact); 
    payload.input[0].scriptText = template.chosenScriptText;
    payload.input[0].avatarSettings.voice = template.chosenVoice;
    payload.input[0].avatar = template.chosenAvatar;


    const response = await axios.post('https://api.synthesia.io/v2/videos', payload, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    const data = response.data;

    if (data && data.id) {
      console.log('Video creation started. Video ID:', data.id);
      return data.id
    } else {
      console.error('Error creating video:', data);
      return null
    }
  } catch (error) {
    console.error('Error: ', error);
  }
};

async function downloadVideo(videoUrl) {
    try {
        // const uniqueFilename = path.join(__dirname, '../Assests', `video_${Date.now()}.mp4`);
        // const uniqueFilename = path.join(__dirname, `video_${Date.now()}.mp4`);
        // const __dirname = path.dirname(fileURLToPath(import.meta.url));
        // const uniqueFilename = path.join(__dirname, `video_${Date.now()}.mp4`);

        const uniqueFilename = `./video_${Date.now()}.mp4`;

        const videoStream = fs.createWriteStream(uniqueFilename);
        const videoResponse = await axios.get(videoUrl, { responseType: 'stream', timeout: 60000 });
        videoResponse.data.pipe(videoStream);
        
        await new Promise((resolve, reject) => {
            videoStream.on('finish',() => {
                console.log('Download completed!');
                resolve(uniqueFilename);
            });
            videoStream.on('error', async (error) => {
                console.error('Error writing the video file');
                reject(error);
            });
        });

        return uniqueFilename;

    } catch (error) {
        console.error("Error processing video:", error);
        return '';
    }
}

async function generateVideo(videoUrl, companyName, recordId = null) {
    try {
        let mainContact = ''
        if(recordId){
            mainContact = await getMainContactFromRecord(recordId);
        }
    const videoPath = await downloadVideo(videoUrl);
    const asset = await uploadAsset(videoPath);
    let generatedVideoId
    if (asset && asset.id) {
         generatedVideoId = await createSyntheticVideo(asset.id, companyName, mainContact);
    }
    
    // setTimeout(() => {
        try {
            fs.unlinkSync(videoPath);
        } catch (err) {
            console.error("Error deleting the video file:", err);
        }
        return generatedVideoId
        
    // }, 30000);
} catch (error) {
    console.error("Error: ", error);
}
}




function generateScriptAndAvatar(mainContact) {
    let scriptText1 = '';
    let scriptText2 = '';
    let scriptText3 = '';
    let avatar1 = 'laura_costume1_cameraA'; // female - Laura
    let avatar2 = 'laura_costume1_cameraA';// female - Jackie
    let avatar3 = 'jonathan_costume1_cameraA'; // male - Jonathan
    let voice1 = '5bb53f78-d009-43fe-94ea-f1508a2c1ad6'; // female
    let voice2 = '5bb53f78-d009-43fe-94ea-f1508a2c1ad6'; // female
    // let voice2 = '02129904-ed79-4c98-b935-b222c950524d'; // female
    let voice3 = '35c4fd8b-53aa-4f2b-b81f-ca98e50086e5'; // male

    if(mainContact) {
        scriptText1 = `Hi ${mainContact}, how are you?\n I noticed your corporate page potential.\n Would you like to try to boost your impressions? Wouldn’t it be nice if your posts live longer and clicks hit more often?\nTry it for free, kick off in 5 minutes.`;
        scriptText2 = `Hi ${mainContact}, are you sure your page is reaching its full potential? With the number of employees you have, you can at least hit 20 plus likes for every post.\nWe can help you boost your likes, impressions, and overall engagement.\nWould you totally oppose giving it a quick free trial?`;
        scriptText3 = `Hi ${mainContact}, it sucks to beg for colleagues to like these posts, right?\nWhat if you could simply automate it for them?\nAsk me for more info, I swear it’s worth it!`;
    } else {
        scriptText1 = `Hi,\n I noticed your corporate page potential.\n Would you like to try to boost your impressions? Wouldn’t it be nice if your posts live longer and clicks hit more often?\nTry it for free, kick off in 5 minutes.`;
        scriptText2 = `Hi,\n are you sure your page is reaching its full potential? With the number of employees you have, you can at least hit 20 plus likes for every post.\nWe can help you boost your likes, impressions, and overall engagement.\nWould you totally oppose giving it a quick free trial?`;
        scriptText3 = `Hi,\n it sucks to beg for colleagues to like these posts, right?\nWhat if you could simply automate it for them?\nAsk me for more info, I swear it’s worth it!`;
    }

    // Choose a random script text
    let randomNum = Math.floor(Math.random() * 3); // This will return 0, 1, or 2
    // let randomNum = 1;
    let chosenScriptText;
    let chosenVoice;
    let chosenAvatar;

    switch(randomNum) {
        case 0:
            chosenScriptText = scriptText1;
            chosenVoice = voice1
            chosenAvatar = avatar1
            break;
            case 1:
                chosenScriptText = scriptText2;
                chosenVoice = voice2
                chosenAvatar = avatar2
                break;
                case 2:
                    chosenScriptText = scriptText3;
                    chosenVoice = voice3
                    chosenAvatar = avatar3
                    break;
                    default:
                        chosenScriptText = scriptText1; 
                        chosenVoice = voice1
                        chosenAvatar = avatar1
    }
    const template = {
        chosenScriptText: chosenScriptText,
        chosenVoice: chosenVoice,
        chosenAvatar: chosenAvatar
    }
    return template;
}


export {
    generateVideo,
  };
  