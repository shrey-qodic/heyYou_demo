import { Worker } from 'worker_threads';

// Function to run a cron job in a separate thread
export function paymentMethodWorkerExecution() {
  return new Promise((resolve, reject) => {
    // Create a new Worker thread and pass a message to start the task
    const worker = new Worker('./utils/workerThreads/workerFiles/paymentUpdateWorker.js');
    
    worker.on('message', (result) => {
      console.log('Job result:', result); // Handle the result from the worker
      resolve(result);
    });

    worker.on('error', (error) => {
      console.log('Worker error:', error);
      reject(error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    worker.postMessage('startTask'); // Start the task in the worker thread
  });
}