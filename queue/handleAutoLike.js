import { findScheduledLike, updateLikeType, saveScheduledLike, fetchAutoLikes, getUsersOfAccount, findPostsByAccountAndTime, findLastPostByAccount, findUserById } from "./dbServices.js"
import { determineTimeSettings, getRandomInterval } from "./helperFunctions.js"
import * as dotenv from "dotenv";
import { visitAndCapturePage } from "../mutations/userMutations.js"
import { mixpanelTrack } from "../utils/mixpanel.js";
dotenv.config();
const ONEMINUTE = 60 * 1000 ;  // 1 minute in milliseconds

export async function handleAutoLikeForNewPost(postId, accountId) {
    try {
        const users = await getUsersOfAccount(accountId);
        const userCount = users.length;
        const timeParams = determineTimeSettings(userCount);
        var now = new Date().getTime(); // Getting current timestamp

        for (let user of users) {
            const existingLike = await findScheduledLike(user._id, postId);
            if (!existingLike) {
                await saveScheduledLike(user, postId, now, timeParams);
                now = now + getRandomInterval(timeParams.minDelay, timeParams.maxDelay);
            }
        }
        
        console.log(`Auto likes queue saved to post: ${postId}`);
    } catch(e) {
        // console.log(e);
        console.log(`Error in handleAutoLikeForNewPost: ${e.message}`);
    }

}


// // not in use becasue we are making compare posts for new users
// export async function handleAutoLikeForNewUser(userId) {
//     try {
//         const user = await findUserById(userId);
//         if (!user) throw new Error(`No user found with id ${userId}`);

//         const { accountId } = user;

//         const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // Three days ago
//         const posts = await findPostsByAccountAndTime(accountId, threeDaysAgo);

//         const timeParams = determineTimeSettings(1);
//         var now = new Date().getTime(); 

//         if (!posts || posts.length === 0) {  // If no posts were found in the last 3 days
//             const lastPost = await findLastPostByAccount(accountId)
//             const existingLike = await findScheduledLike(user._id, lastPost._id);
//             if (!existingLike) {
//             await saveScheduledLike(user, lastPost._id, now, timeParams);
//             now = now + getRandomInterval(timeParams.minDelay, timeParams.maxDelay);
//             }
//         } else {
//             for (let post of posts) {
//                 const existingLike = await findScheduledLike(user._id, post._id);
//                 if (!existingLike) {
//                 await saveScheduledLike(user, post._id, now, timeParams);
//                 now = now + getRandomInterval(timeParams.minDelay, timeParams.maxDelay);
//                 }
//             }
//         }

//     } catch(e){
//         console.log(e);
//     }
// }


// real http request to view post
export async function getScheduledLikes() {
    return console.log("Comenting server likes");
    console.log("Start Searching Scheduled Likes...");
    setInterval(async () => {
      const currentTimestamp = Date.now(); // Get the current timestamp
      const likesDueForAutoLike = await fetchAutoLikes(currentTimestamp);
      for (let like of likesDueForAutoLike) {
        if(!like?.likeType){
            try {
            console.log(`Auto-liking post ${like.postId} for user ${like.userId}`);
            const response = await visitAndCapturePage(like.userId, like.postId);
            if (response && response.success && response.message ==='Viewed the page and Liked') {
                console.log(`Successfully liked post ${like.postId}`);
                await updateLikeType(like.userId, like.postId, "server")
                mixpanelTrack("Server-Like", like.userId, { Post: like.postId })
            } else if(response && response.success && response.message === 'User already liked') {
                await updateLikeType(like.userId, like.postId, "user")
                mixpanelTrack("Manual-Like", like.userId, { Post: like.postId })
                console.log(`Already like by Manual ${like.postId}: ${response.message}`);
            }
            } catch (error) {
                console.log(`An error occurred while liking post ${like.postId}: ${error}`);
            }
       } else {
        console.log(`User already liked the post ${like.postId}`);
       }
      }
    }, ONEMINUTE);
  }
