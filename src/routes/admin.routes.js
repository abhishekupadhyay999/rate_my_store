import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../lib/middleware/auth.middleware.js';

const router = Router();

// Allow only logged-in admins to access these routes
function requireAdmin(req, res, next) {
  if (req.auth.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }

  next();
}

// GET /api/admin/stats
// Get dashboard totals
router.get(
  '/stats',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [totalUsers, totalStores, totalRatings] =
        await Promise.all([
          prisma.user.count(),
          prisma.store.count(),
          prisma.rating.count(),
        ]);

      return res.json({
        success: true,
        stats: {
          totalUsers,
          totalStores,
          totalRatings,
        },
      });
    } catch (error) {
      console.error('Admin stats error:', error);

      return res.status(500).json({
        success: false,
        message: 'Could not fetch dashboard statistics',
      });
    }
  }
);

// GET /api/admin/users
// List registered users without exposing passwords
router.get(
  '/users',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          address: true,
          role: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return res.json({
        success: true,
        count: users.length,
        users,
      });
    } catch (error) {
      console.error('Admin users error:', error);

      return res.status(500).json({
        success: false,
        message: 'Could not fetch users',
      });
    }
  }
);

export default router;