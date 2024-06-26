const DiskStorage = require('../providers/DiskStorage')
const AppError = require('../utils/AppError')
const knex = require('../database/knex')

/**
 * Controlador para a gestão de pratos.
 */
class PlatesController {

  /**
   * Cria um novo prato com os dados fornecidos.
   * @param {Object} req - Objeto de solicitação HTTP.
   * @param {Object} res - Objeto de resposta HTTP.
   */
  async create(req, res) {
    const { title, description, value, ingredients, category } = req.body
    const user_id = req.user.id
    const picture = req.file.filename
    const diskStorage = new DiskStorage()
    const filePlate = await diskStorage.saveFile(picture)

    if (!req.file) {
      throw new AppError('Faltou adicionar a imagem!')
    }

    let ingredientIds = []
    const ingredientSplit = ingredients.split(',')

    await Promise.all(
      ingredientSplit.map(async (item) => {
        const trimmedItem = item.trim();
        const lowerCaseItem = trimmedItem.toLowerCase();

        let [ingredient] = await knex("ingredients")
          .where("name", lowerCaseItem)
          .pluck("id");

        if (!ingredient) {
          [ingredient] = await knex("ingredients")
            .insert({ name: lowerCaseItem })
            .returning("id");
          ingredientIds.push(ingredient.id);
        }
        else {
          ingredientIds.push(ingredient);
        }
      }),
    )

    if (!category || category < 1 && category > 4) {
      return res
        .status(400)
        .json({ error: 'Categoria errada' })
    }

    if (!title || !value || !description) {
      throw new AppError('Não foi possivel realizar a criação do prato!')
    }

    const formattedValue = parseFloat(
      value.replace(',', '.')
    )

    const [plate] = await knex('plates')
      .insert({
        title,
        description,
        ingredients: JSON.stringify(ingredientIds),
        value: formattedValue,
        picture: filePlate,
        user_id,
        category_id: category
      })
      .returning('id')

    if (!ingredientIds || ingredientIds.length === 0) {
      return res
        .status(400)
        .json({ error: 'Não foi passado nenhum ingrediente válido' })
    }

    return res.json({ plate_id: plate })
  }

  /**
   * Obtém os detalhes de um prato específico.
   * @param {Object} req - Objeto de solicitação HTTP.
   * @param {Object} res - Objeto de resposta HTTP.
   */
  async show(req, res) {
    const { id } = req.params

    const plate = await knex('plates').where('id', id).first()

    if (!plate) {
      return res.status(404).json({ error: 'Prato não encontrado' })
    }

    return res.json(plate)
  }

  /**
   * Lista todos os pratos disponíveis.
   * @param {Object} req - Objeto de solicitação HTTP.
   * @param {Object} res - Objeto de resposta HTTP.
   */
  async index(req, res) {
    const plates = await knex('plates').select('*')

    return res.json(plates)
  }

  /**
   * Atualiza os detalhes de um prato existente com os dados fornecidos.
   * @param {Object} req - Objeto de solicitação HTTP.
   * @param {Object} res - Objeto de resposta HTTP.
   */
  async update(req, res) {
    const { id } = req.params
    const { title, description, value, ingredients, category } = req.body
    const plate = await knex('plates').where({ id }).first()

    if (!plate) {
      return res.status(404).json({ error: 'Prato não encontrado' })
    }

    const diskStorage = new DiskStorage()

    if (req.file) {
      const picture = req.file.filename
      const filePlate = await diskStorage.saveFile(picture)
      await knex('plates').where({ id }).update({ picture: filePlate })
    }

    if (title || description || value || ingredients || category) {
      const updateData = {}

      if (title) {
        updateData.title = title
      }

      if (description) {
        updateData.description = description
      }

      if (value) {
        const formattedValue = value.replace(',', '.')
        updateData.value = formattedValue
      }

      // tratamento para os ingredientes
      if (ingredients) {
        const ingredientIds = []
        const ingredientSplit = ingredients.split(',')

        // como existe uma tabela para ingredients e por padrão ela já possui alguns valores setados ao criar, caso o usuário digite um ingrediente que não esta cadastrado, ira adicioná-lo
        await Promise.all(
          ingredientSplit.map(async (item) => {
            const trimmedItem = item.trim();
            const lowerCaseItem = trimmedItem.toLowerCase();
    
            let [ingredient] = await knex("ingredients")
              .where("name", lowerCaseItem)
              .pluck("id");
    
            if (!ingredient) {
              [ingredient] = await knex("ingredients")
                .insert({ name: lowerCaseItem })
                .returning("id");
              ingredientIds.push(ingredient.id);
            }
            else {
              ingredientIds.push(ingredient);
            }
          }),
        )

        updateData.ingredients = JSON.stringify(ingredientIds)
      }
      updateData.category_id = category

      await knex('plates').where({ id }).update(updateData)
    }
    return res.json({ success: true })
  }

  /**
   * Pesquisa pratos com base em um título fornecido.
   * @param {Object} req - Objeto de solicitação HTTP.
   * @param {Object} res - Objeto de resposta HTTP.
   */
  async search(req, res) {
    const { title } = req.query

    const plates = await knex('plates')
      .where('title', 'like', `%${title}%`)
      .select('*')

    return res.json(plates)
  }

  /**
 * Exclui um prato existente e os pedidos relacionados a ele.
 * @param {Object} req - Objeto de solicitação HTTP.
 * @param {Object} res - Objeto de resposta HTTP.
 */
async delete(req, res) {
  const { id } = req.params;
  const user_id = req.user.id;

  // Verifica se o prato existe e se pertence ao usuário logado
  const plate = await knex('plates').where({ id }).first();

  if (!plate) {
    return res.status(404).json({ error: 'Prato não encontrado' });
  }

  if (plate.user_id !== user_id) {
    return res
      .status(403)
      .json({ error: 'Acesso negado, você não é o dono deste prato' });
  }

  try {
    // Inicia uma transação para garantir a integridade dos dados
    await knex.transaction(async (trx) => {
      // Exclui os pedidos relacionados ao prato
      await trx('orders').where('plate_id', id).delete();

      // Em seguida, exclui o prato
      await trx('plates').where({ id }).delete();
    });

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Ocorreu um erro ao excluir o prato e seus pedidos relacionados' });
  }
}
}

module.exports = PlatesController
