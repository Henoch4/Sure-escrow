// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SureEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable escrowToken;

    struct Milestone {
        uint256 amount;
        bool released;
    }

    struct Deal {
        address client;
        address freelancer;
        Milestone[] milestones;
        uint256 funded;
        uint256 releasedTotal;
        bool active;
        bool disputed;
    }

    Deal[] public deals;
    uint256 public totalDeals;
    uint256 public totalReleased;

    event DealCreated(uint256 indexed dealId, address indexed client, address indexed freelancer, uint256 total, uint256 milestoneCount);
    event MilestoneReleased(uint256 indexed dealId, uint256 indexed milestone, address indexed freelancer, uint256 amount);
    event DealCancelled(uint256 indexed dealId, address indexed client, uint256 refund);
    event DealDisputed(uint256 indexed dealId, address indexed by);
    event DisputeResolved(uint256 indexed dealId, bool paidToFreelancer, uint256 toFreelancer, uint256 toClient);

    constructor(address _escrowToken) Ownable(msg.sender) {
        escrowToken = IERC20(_escrowToken);
    }

    function createDeal(address freelancer, uint256[] calldata milestoneAmounts) external nonReentrant {
        require(freelancer != address(0) && freelancer != msg.sender, "Bad freelancer");
        require(milestoneAmounts.length > 0, "Need milestones");
        uint256 total = 0;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            require(milestoneAmounts[i] > 0, "Zero milestone");
            total += milestoneAmounts[i];
        }
        escrowToken.safeTransferFrom(msg.sender, address(this), total);

        uint256 id = deals.length;
        Deal storage d = deals.push();
        d.client = msg.sender;
        d.freelancer = freelancer;
        d.funded = total;
        d.active = true;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            d.milestones.push(Milestone(milestoneAmounts[i], false));
        }
        totalDeals += 1;
        emit DealCreated(id, msg.sender, freelancer, total, milestoneAmounts.length);
    }

    function release(uint256 dealId, uint256 milestoneIdx) external nonReentrant {
        Deal storage d = deals[dealId];
        require(d.active, "Deal not active");
        require(!d.disputed, "Disputed");
        require(d.client == msg.sender, "Client only");
        require(milestoneIdx < d.milestones.length, "No milestone");
        require(!d.milestones[milestoneIdx].released, "Already released");

        d.milestones[milestoneIdx].released = true;
        uint256 amount = d.milestones[milestoneIdx].amount;
        d.releasedTotal += amount;
        totalReleased += amount;
        escrowToken.safeTransfer(d.freelancer, amount);
        emit MilestoneReleased(dealId, milestoneIdx, d.freelancer, amount);

        bool allReleased = true;
        for (uint256 i = 0; i < d.milestones.length; i++) {
            if (!d.milestones[i].released) { allReleased = false; break; }
        }
        if (allReleased) d.active = false;
    }

    function cancel(uint256 dealId) external nonReentrant {
        Deal storage d = deals[dealId];
        require(d.active, "Deal not active");
        require(d.client == msg.sender, "Client only");
        require(d.releasedTotal == 0, "Already partially released");
        uint256 refund = d.funded;
        d.active = false;
        escrowToken.safeTransfer(d.client, refund);
        emit DealCancelled(dealId, d.client, refund);
    }

    function dispute(uint256 dealId) external {
        Deal storage d = deals[dealId];
        require(d.active, "Deal not active");
        require(msg.sender == d.freelancer || msg.sender == d.client, "Parties only");
        d.disputed = true;
        emit DealDisputed(dealId, msg.sender);
    }

    function resolveDispute(uint256 dealId, bool payFreelancer) external nonReentrant {
        require(owner() == msg.sender, "Arbiter only");
        Deal storage d = deals[dealId];
        require(d.disputed && d.active, "Not disputing");

        uint256 remaining = d.funded - d.releasedTotal;
        uint256 toFreelancer = 0;
        uint256 toClient = 0;
        if (payFreelancer) {
            uint256 unreleased = 0;
            for (uint256 i = 0; i < d.milestones.length; i++) {
                if (!d.milestones[i].released) unreleased += d.milestones[i].amount;
            }
            toFreelancer = unreleased < remaining ? unreleased : remaining;
            toClient = remaining - toFreelancer;
            d.releasedTotal += toFreelancer;
            totalReleased += toFreelancer;
        } else {
            toClient = remaining;
        }
        d.active = false;
        d.disputed = false;
        if (toFreelancer > 0) escrowToken.safeTransfer(d.freelancer, toFreelancer);
        if (toClient > 0) escrowToken.safeTransfer(d.client, toClient);
        emit DisputeResolved(dealId, payFreelancer, toFreelancer, toClient);
    }

    function getDeal(uint256 dealId)
        external
        view
        returns (address, address, uint256, uint256, uint256, bool, bool, uint256[] memory, bool[] memory)
    {
        Deal storage d = deals[dealId];
        uint256[] memory amts = new uint256[](d.milestones.length);
        bool[] memory rel = new bool[](d.milestones.length);
        for (uint256 i = 0; i < d.milestones.length; i++) {
            amts[i] = d.milestones[i].amount;
            rel[i] = d.milestones[i].released;
        }
        return (d.client, d.freelancer, d.funded, d.releasedTotal, d.milestones.length, d.active, d.disputed, amts, rel);
    }
}
