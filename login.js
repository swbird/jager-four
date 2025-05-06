import { ethers } from 'ethers';
import axios from 'axios';

const API_BASE_URL = 'https://four.meme/meme-api/v1/private';

/**
 * 获取nonce
 * @param {string} address - 钱包地址
 * @returns {Promise<string>} nonce值
 */
async function getNonce(address) {
    try {
        const response = await axios.post(`${API_BASE_URL}/user/nonce/generate`, {
            accountAddress: address,
            verifyType: "LOGIN",
            networkCode: "BSC"
        });
        
        if (response.data.code === 0) {
            return response.data.data;
        }
        throw new Error(`获取nonce失败: ${response.data.msg}`);
    } catch (error) {
        console.error('获取nonce出错:', error);
        throw error;
    }
}

/**
 * 签名消息
 * @param {string} message - 要签名的消息
 * @param {string} privateKey - 私钥
 * @returns {Promise<string>} 签名结果
 */
async function signMessage(message, privateKey) {
    try {
        const wallet = new ethers.Wallet(privateKey);
        const signature = await wallet.signMessage(message);
        return signature;
    } catch (error) {
        console.error('签名消息出错:', error);
        throw error;
    }
}

/**
 * 登录
 * @param {string} address - 钱包地址
 * @param {string} signature - 签名
 * @returns {Promise<string>} 登录token
 */
async function login(address, signature) {
    try {
        const response = await axios.post(`${API_BASE_URL}/user/login/dex`, {
            region: "WEB",
            langType: "EN",
            loginIp: "",
            inviteCode: "",
            verifyInfo: {
                address: address,
                networkCode: "BSC",
                signature: signature,
                verifyType: "LOGIN"
            },
            walletName: "MetaMask"
        });

        if (response.data.code === 0) {
            return response.data.data;
        }
        throw new Error(`登录失败: ${response.data.msg}`);
    } catch (error) {
        console.error('登录出错:', error);
        throw error;
    }
}

/**
 * 执行完整的登录流程
 * @param {string} address - 钱包地址
 * @param {string} privateKey - 私钥
 * @returns {Promise<string>} 登录token
 */
async function doLogin(privateKey) {
    try {
        const wallet = new ethers.Wallet(privateKey);

        // 1. 获取nonce
        const nonce = await getNonce(wallet.address);
        console.log(wallet.address,'获取nonce成功:', nonce);

        // 2. 签名消息
        const message = `You are sign in Meme ${nonce}`;
        const signature = await signMessage(message, privateKey);
        // console.log('签名成功');

        // 3. 登录
        const token = await login(wallet.address, signature);
        console.log(wallet.address,'登录成功');
        
        return token;
    } catch (error) {
        console.error('登录流程出错:', error);
        throw error;
    }
}

// // 测试函数
// async function main() {
//     try {
//         const address = "0x672108336D05aCB5fBb1D9b596688deD43D22a9B";
//         const privateKey = "你的私钥"; // 请替换为实际的私钥
        
//         const token = await doLogin(address, privateKey);
//         console.log('登录token:', token);
//     } catch (error) {
//         console.error('测试失败:', error);
//     }
// }

// 导出函数供其他文件使用
export {
    doLogin,
    getNonce,
    signMessage,
    login
};

// // 如果直接运行此文件，则执行main函数
// if (process.argv[1] === import.meta.url) {
//     main().catch(console.error);
// }
