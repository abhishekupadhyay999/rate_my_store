import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../lib/middleware/auth.middleware.js';

const router = Router();

// Validation for creating a store
const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().optional(),
  address: z.string().trim().min(1).max(400),
});

// GET /api/stores
// List stores with search and average ratings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const search = req.query.search?.trim();

    const stores = await prisma.store.findMany({
      where: search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                address: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : undefined,
      include: {
        _count: {
          select: { ratings: true },
        },
        ratings: {
          select: { score: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = stores.map((store) => {
      const { ratings, ...storeDetails } = store;

      const total = ratings.reduce(
        (sum, rating) => sum + rating.score,
        0
      );

      const averageRating =
        ratings.length > 0
          ? Number((total / ratings.length).toFixed(2))
          : null;

      return {
        ...storeDetails,
        averageRating,
      };
    });

    return res.json({
      success: true,
      count: result.length,
      stores: result,
    });
  } catch (error) {
    console.error('List stores error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch stores',
    });
  }
});

// GET /api/stores/:id
// Get one store with its average rating
router.get('/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid store ID',
    });
  }

  try {
    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        ratings: {
          select: {
            score: true,
            createdAt: true,
          },
        },
      },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    const total = store.ratings.reduce(
      (sum, rating) => sum + rating.score,
      0
    );

    const averageRating =
      store.ratings.length > 0
        ? Number((total / store.ratings.length).toFixed(2))
        : null;

    return res.json({
      success: true,
      store: {
        ...store,
        averageRating,
        ratingCount: store.ratings.length,
      },
    });
  } catch (error) {
    console.error('Get store error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch store',
    });
  }
});

// POST /api/stores
// Only admins can create stores
router.post('/', authenticateToken, async (req, res) => {
  if (req.auth.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Only admins can create stores',
    });
  }

  const validation = createStoreSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid store details',
      errors: validation.error.issues,
    });
  }

  try {
    const store = await prisma.store.create({
      data: validation.data,
    });

    return res.status(201).json({
      success: true,
      message: 'Store created successfully',
      store,
    });
  } catch (error) {
    console.error('Create store error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not create store',
    });
  }
});

// POST /api/stores/:id/ratings
// Submit or update the logged-in user's rating
router.post('/:id/ratings', authenticateToken, async (req, res) => {
  const storeId = Number(req.params.id);

  if (!Number.isInteger(storeId) || storeId < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid store ID',
    });
  }

  const schema = z.object({
    score: z.number().int().min(1).max(5),
  });

  const validation = schema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: 'Rating must be an integer between 1 and 5',
    });
  }

  try {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    const userId = Number(req.auth.userId);
    const { score } = validation.data;

    const rating = await prisma.rating.upsert({
      where: {
        userId_storeId: {
          userId,
          storeId,
        },
      },
      update: { score },
      create: {
        userId,
        storeId,
        score,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Rating submitted successfully',
      rating,
    });
  } catch (error) {
    console.error('Submit rating error:', error);

    return res.status(500).json({
      success: false,
      message: 'Could not submit rating',
    });
  }
});


// GET /api/stores/:id/ratings
// Get ratings and average score for a store
router.get('/:id/ratings', authenticateToken, async (req, res) => {
  const storeId = Number(req.params.id);

  if (!Number.isInteger(storeId) || storeId < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid store ID',
    });
  }

  try {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    const ratings = await prisma.rating.findMany({
      where: { storeId },
      select: {
        id: true,
        score: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const total = ratings.reduce(
      (sum, rating) => sum + rating.score,
      0
    );

    const averageRating =
      ratings.length > 0
        ? Number((total / ratings.length).toFixed(2))
        : null;

    return res.json({
      success: true,
      count: ratings.length,
      averageRating,
      ratings,
    });
  } catch (error) {
    console.error('Get ratings error:', error);

    return res.status(500).json({
      success: false,
      message: 'Could not fetch ratings',
    });
  }
});

export default router;