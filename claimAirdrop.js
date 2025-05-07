import { ethers } from 'ethers';
import axios from 'axios';
import { readEvmAddressesAndKeys } from './utils.js';

const API_BASE_URL = 'https://api.jager.meme/api/airdrop';
const CLAIM_CONTRACT = '0xDF6dbd6d4069bF0c9450538238A9643C72E4a6E4';
const INVITOR = '0x88888888Ce394F3D5E318B66cbEc6ED6e9cA980b';

// 初始化 provider
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

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
        console.error('签名消息失败:', error);
        throw error;
    }
}

/**
 * 调用领取空投API
 * @param {string} address - 钱包地址
 * @param {string} signature - 签名
 * @returns {Promise<Object>} API响应
 */
async function claimAirdropAPI(address, signature) {
    try {
        const response = await axios.post(`${API_BASE_URL}/claimAirdrop`, {
            address: address,
            solAddress: "",
            signStr: signature,
            solSignStr: ""
        });

        if (response.data.code === 200) {
            return response.data.data;
        }
        throw new Error(`API返回错误: ${response.data.message}`);
    } catch (error) {
        console.error('调用领取空投API失败:', error);
        throw error;
    }
}

/**
 * 调用合约领取空投
 * @param {string} privateKey - 私钥
 * @param {Object} claimData - 领取数据
 * @returns {Promise<string>} 交易哈希
 */
async function claimAirdropContract(privateKey, claimData) {
    try {
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // 合约ABI
        const abi = [
            "function claim(address account, uint256 amount, uint256 deadline, bytes calldata sign, bool instant, address invitor) external"
        ];
        
        const contract = new ethers.Contract(CLAIM_CONTRACT, abi, wallet);
        
        // 调用合约
        const tx = await contract.claim(
            claimData.address,
            ethers.parseEther(claimData.amount),
            claimData.deadline,
            claimData.sign,
            true, // instant
            INVITOR,
            {
                gasLimit: 400000
            }
        );
        
        // 等待交易确认
        const receipt = await tx.wait();
        return receipt.hash;
    } catch (error) {
        console.error('调用合约失败:', error);
        throw error;
    }
}

/**
 * 执行领取空投
 * @param {string} address - 钱包地址
 * @param {string} privateKey - 私钥
 */
async function doClaim(address, privateKey) {
    try {
        console.log(`\n开始为地址 ${address} 领取空投`);
        
        // 1. 签名消息
        const message = ethers.getAddress(address); // 获取checksum地址
        const signature = await signMessage(message, privateKey);
        console.log('签名完成');
        
        // 2. 调用API获取领取数据
        const claimData = await claimAirdropAPI(address, signature);
        console.log('获取领取数据成功');
        console.log('领取数量:', claimData.amount);
        console.log('领取数据:', claimData);
        // 3. 调用合约领取空投
        const txHash = await claimAirdropContract(privateKey, claimData);
        console.log('领取成功！');
        console.log('交易哈希:', txHash);
        
        return true;
    } catch (error) {
        console.error('领取空投失败:', error);
        return false;
    }
}

/**
 * 主函数
 */
async function main() {
    const fs = await import('fs/promises');
    let successCount = 0;
    let failCount = 0;
    
    try {
        // 读取地址列表
        const { addrs, secks } = readEvmAddressesAndKeys('./addrs.txt');
        console.log(`开始处理 ${addrs.length} 个地址的空投领取`);
        
        // 创建或清空结果文件
        await fs.writeFile('claim_results.txt', '地址,领取结果,交易哈希,错误信息\n');
        
        // 逐个处理地址
        for (let i = 0; i < addrs.length; i++) {
            const address = addrs[i];
            const privateKey = secks[i];
            
            console.log(`\n处理第 ${i + 1}/${addrs.length} 个地址: ${address}`);
            
            try {
                const success = await doClaim(address, privateKey);
                
                // 记录结果
                const result = success ? '成功' : '失败';
                await fs.appendFile('claim_results.txt', `${address},${result},${success ? '成功' : '无'},无\n`);
                
                if (success) {
                    successCount++;
                } else {
                    failCount++;
                }
                
                // 等待3秒再处理下一个地址
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (error) {
                failCount++;
                console.error(`处理地址 ${address} 时出错:`, error);
                // 记录错误信息，但继续处理下一个地址
                await fs.appendFile('claim_results.txt', `${address},失败,无,${error.message}\n`);
                
                // 等待3秒后继续
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        // 输出最终统计结果
        console.log('\n所有地址处理完毕！');
        console.log(`成功: ${successCount} 个地址`);
        console.log(`失败: ${failCount} 个地址`);
        console.log('结果已保存到 claim_results.txt');
        
    } catch (error) {
        console.error('程序执行出错:', error);
        // 记录程序级别的错误
        await fs.appendFile('claim_results.txt', `程序错误,${error.message}\n`);
    }
}

// 执行主函数
main().catch(console.error);
